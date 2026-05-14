"""
00-prepare.py
Reads ../data/poets_full_dataset.csv and outputs output/stories.csv
with the columns required by the rest of the pipeline:
  id, date, title, text, url, source, author
"""

import os
import sys
import pandas as pd
import argparse


def main(input_file, output_file):
    df = pd.read_csv(input_file)

    required = ['Title', 'Poet', 'Year', 'URL', 'Poem Text']
    missing = [c for c in required if c not in df.columns]
    if missing:
        sys.exit(f"Error: missing columns in input: {missing}")

    # Drop rows missing required fields
    before = len(df)
    df = df.dropna(subset=['Title', 'Poet', 'Year', 'Poem Text'])
    dropped = before - len(df)
    if dropped:
        print(f"Dropped {dropped} rows with missing fields.")

    out = pd.DataFrame({
        'id':     range(len(df)),
        'date':   df['Year'].apply(lambda y: f"{int(y):04d}-01-01"),
        'title':  df['Title'].values,
        'text':   df['Poem Text'].str.replace('\n', ' ', regex=False).values,
        'url':    df['URL'].fillna('').values,
        'source': df['Poet'].values,
        'author': df['Poet'].values,
    })

    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)
    out.to_csv(output_file, index=False)
    print(f"Wrote {len(out)} rows to {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Prepare poets CSV for the semantic-map pipeline.')
    parser.add_argument('--input',  default='../data/poets_full_dataset.csv')
    parser.add_argument('--output', default='output/stories.csv')
    args = parser.parse_args()
    main(args.input, args.output)
