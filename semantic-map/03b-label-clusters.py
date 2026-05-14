"""
03b-label-clusters.py
For each cluster, samples poems and asks GPT to generate a 3-5 word
label capturing what makes that cluster distinctive from the others.
Adds a cluster_label column to the CSV and saves a cluster_labels.json.

Labels are generated sequentially so each prompt knows what labels have
already been assigned, preventing duplicate or near-duplicate phrasing.
"""

import os
import sys
import json
import argparse
import pandas as pd
import dotenv
from openai import OpenAI

dotenv.load_dotenv()
client = OpenAI()

MODEL = "gpt-4o-mini"
TITLE_SAMPLE  = 15   # poem titles to show per cluster (titles are information-dense)
EXCERPT_SAMPLE = 5   # poems to show with text excerpts
EXCERPT_LEN   = 100  # characters of text per excerpt

# Words that produce vague, overlapping labels — ban them explicitly
BANNED_WORDS = [
    "longing", "transformation", "journey", "reflection", "exploration",
    "wandering", "searching", "discovery", "connection", "existence",
    "transcendence", "awakening", "resilience", "poem", "verse", "poetry",
    "writing", "literature",
]


def build_prompt(cluster_id, titles, excerpt_df, assigned_labels):
    title_block = '\n'.join(f'  {t}' for t in titles)

    excerpts = []
    for _, row in excerpt_df.iterrows():
        text = str(row['text'])[:EXCERPT_LEN].strip()
        excerpts.append(f'  "{row["title"]}": {text}…')
    excerpt_block = '\n'.join(excerpts)

    banned = ', '.join(f'"{w}"' for w in BANNED_WORDS)

    if assigned_labels:
        used_block = '\n'.join(f'  - {lbl}' for lbl in assigned_labels.values())
        uniqueness_instruction = f"""These labels are already taken — yours must be clearly different from all of them:
{used_block}"""
    else:
        uniqueness_instruction = "This is the first label, so make it as specific as possible."

    return f"""You are labeling clusters of poems for a semantic map. Each cluster needs a SHORT, SPECIFIC label (3–5 words) that names the concrete subject matter of those poems.

Good label examples: "young romance and heartbreak", "death and grief", "immigration and placelessness", "Black American history", "motherhood and childbirth", "war and soldier life", "the natural world and seasons"
Bad label examples: "urban longing and transformation", "oceanic searching and reflection", "spiritual journey" — these are too abstract and interchangeable.

Cluster {cluster_id} poem titles:
{title_block}

Sample excerpts:
{excerpt_block}

{uniqueness_instruction}

Rules:
- Name the SUBJECT MATTER (people, places, events, relationships, objects) — not the emotional tone
- Banned abstract filler words: {banned}
- 3–5 words maximum
- Reply with ONLY the label, no punctuation, no explanation"""


def generate_label(cluster_id, cluster_df, assigned_labels):
    # Sample titles broadly (more titles = better signal)
    titles = cluster_df['title'].sample(
        min(TITLE_SAMPLE, len(cluster_df)), random_state=42
    ).tolist()

    # Sample a smaller set for text excerpts
    excerpt_df = cluster_df.sample(min(EXCERPT_SAMPLE, len(cluster_df)), random_state=42)

    prompt = build_prompt(cluster_id, titles, excerpt_df, assigned_labels)
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=20,
        temperature=0.4,
    )
    return response.choices[0].message.content.strip().strip('"').strip("'")


def main(file):
    print(f"Loading data from {file}...")
    df = pd.read_csv(file)

    if 'cluster' not in df.columns:
        sys.exit("Error: 'cluster' column not found. Run 03-cluster.py first.")

    # Sort by cluster size descending — label the biggest (most representative)
    # clusters first so smaller ones can differentiate against them
    clusters = (
        df['cluster'].value_counts()
        .sort_values(ascending=False)
        .index.tolist()
    )
    print(f"Generating labels for {len(clusters)} clusters using {MODEL}...")

    assigned_labels = {}  # cid -> label, grows as we go
    for cid in clusters:
        cluster_df = df[df['cluster'] == cid]
        label = generate_label(cid, cluster_df, assigned_labels)
        assigned_labels[cid] = label
        print(f"  Cluster {cid:>3} ({len(cluster_df):>4} poems): {label}")

    df['cluster_label'] = df['cluster'].map(assigned_labels)
    df.to_csv(file, index=False)
    print(f"\nSaved updated CSV to {file}")

    labels_file = os.path.join(os.path.dirname(file), 'cluster_labels.json')
    with open(labels_file, 'w') as f:
        json.dump({str(k): v for k, v in assigned_labels.items()}, f, indent=2)
    print(f"Saved label reference to {labels_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Generate descriptive cluster labels using GPT.')
    parser.add_argument('--file', default='output/stories_processed.csv',
                        help='CSV file with a cluster column (default: output/stories_processed.csv).')
    args = parser.parse_args()
    main(args.file)
