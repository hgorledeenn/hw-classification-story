import sys
import os
import pandas as pd
import numpy as np
from sklearn.manifold import TSNE
from sklearn.decomposition import PCA
import umap
import argparse

import dotenv
dotenv.load_dotenv()

from tqdm import tqdm
tqdm.pandas()

def fetch_data(file_path):
    """Fetches data from the specified CSV file."""
    df = pd.read_csv(file_path)
    df['embedding'] = df['embedding'].progress_apply(eval)
    return df

def run_tsne(embeddings):
    """Applies t-SNE on embeddings to get 2D coordinates."""
    print("Running t-SNE on embeddings...")
    tsne = TSNE(
        n_components=2,
        perplexity=80,
        metric='cosine',
        early_exaggeration=40,
        init='pca',
        max_iter=2000,
        learning_rate=100,
        random_state=42
    )
    results = tsne.fit_transform(embeddings)
    print("t-SNE complete.")
    return results

def run_pca(embeddings):
    """Applies PCA on embeddings to get 2D coordinates."""
    print("Running PCA on embeddings...")
    pca = PCA(n_components=2, random_state=42)
    results = pca.fit_transform(embeddings)
    print(f"PCA complete. Explained variance: {pca.explained_variance_ratio_.sum():.1%}")
    return results

def run_umap(embeddings):
    """Applies UMAP on embeddings to get 2D coordinates."""
    print("Running UMAP on embeddings...")
    reducer = umap.UMAP(
        n_components=2,
        metric='cosine',
        random_state=42
    )
    results = reducer.fit_transform(embeddings)
    print("UMAP complete.")
    return results

def main(input_file, algorithm):
    # Step 1: Fetch the data
    print("Fetching data...")
    df = fetch_data(input_file)

    # Step 2: Extract embeddings and reduce dimensions
    embeddings = np.stack(df['embedding'].values)
    if algorithm == 'tsne':
        results = run_tsne(embeddings)
    elif algorithm == 'pca':
        results = run_pca(embeddings)
    elif algorithm == 'umap':
        results = run_umap(embeddings)
    else:
        sys.exit(f"Error: Unknown algorithm '{algorithm}'. Choose from: tsne, pca, umap.")

    # Step 3: Add x/y results to the dataframe and drop embeddings
    df['x'] = results[:, 0]
    df['y'] = results[:, 1]
    df = df.drop(columns=['embedding'])

    # Step 4: Save the resulting dataframe back to the same file
    print(f"Saving results to {input_file}...")
    df.to_csv(input_file, index=False, encoding='utf-8')
    print(f"File saved as {input_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Reduce embedding dimensions to 2D for visualization.')
    parser.add_argument('--file', type=str, default='output/stories_processed.csv',
                        help='Path to the input CSV file (default: output/stories_processed.csv).')
    parser.add_argument('--algorithm', type=str, required=True, choices=['tsne', 'pca', 'umap'],
                        help='Dimensionality reduction algorithm to use: tsne, pca, or umap.')
    args = parser.parse_args()
    main(args.file, args.algorithm)
