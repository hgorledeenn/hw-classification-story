"""
03-cluster.py
Author: Dhrumil
Date: 2025-05-13
Description: This python file
    1. reads output/stories_with_embeddings.csv
    2. applies k-means or DBSCAN clustering to the embeddings
    3. adds a cluster column to the data
    4. saves the dataframe to output/stories-with-clusters.csv
"""

import sys
import os
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from tqdm import tqdm
import argparse

# Enable progress bars in pandas apply
tqdm.pandas()


def cluster_kmeans(embeddings_matrix, n_clusters=10):
    print(f"Applying k-means clustering with {n_clusters} clusters...")
    model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    return model.fit_predict(embeddings_matrix)


def cluster_dbscan(embeddings_matrix, eps=0.4, min_samples=5):
    print(f"Applying DBSCAN clustering with eps={eps}, min_samples={min_samples}...")
    model = DBSCAN(eps=eps, min_samples=min_samples, metric='cosine')
    labels = model.fit_predict(embeddings_matrix)
    n_noise = (labels == -1).sum()
    if n_noise > 0:
        print(f"Note: {n_noise} points ({n_noise/len(labels)*100:.1f}%) were labeled as noise (cluster -1)")
    return labels


def main(file, algorithm, n_clusters=10, eps=0.4):
    # 1. Load stories_with_embeddings.csv
    print(f"Loading data from {file}...")
    df = pd.read_csv(file)

    # 2. Convert string embeddings to numpy arrays
    print("Processing embeddings...")
    df['embedding'] = df['embedding'].progress_apply(eval)

    # 3. Stack embeddings into a matrix for clustering
    print("Preparing embeddings for clustering...")
    embeddings_matrix = np.stack(df['embedding'].values)

    # 4. Apply clustering
    if algorithm == 'kmeans':
        df['cluster'] = cluster_kmeans(embeddings_matrix, n_clusters=n_clusters)
    elif algorithm == 'dbscan':
        df['cluster'] = cluster_dbscan(embeddings_matrix, eps=eps)
    else:
        sys.exit(f"Error: Unknown algorithm '{algorithm}'. Choose from: kmeans, dbscan.")

    # 5. Print cluster distribution
    cluster_counts = df['cluster'].value_counts().sort_index()
    print("\nCluster distribution:")
    for cluster, count in cluster_counts.items():
        label = "noise" if cluster == -1 else str(cluster)
        print(f"Cluster {label}: {count} items ({count/len(df)*100:.1f}%)")

    # 6. Save the DataFrame with clusters back to the same file
    print(f"\nSaving results to {file}...")
    df.to_csv(file, index=False)
    print(f"File saved as {file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Apply clustering to embeddings.')
    parser.add_argument('--file', type=str, default='output/stories_processed.csv',
                        help='Path to the input CSV file (default: output/stories_processed.csv).')
    parser.add_argument('--algorithm', type=str, required=True, choices=['kmeans', 'dbscan'],
                        help='Clustering algorithm to use: kmeans or dbscan.')
    parser.add_argument('--clusters', type=int, default=10,
                        help='Number of clusters for k-means (default: 10).')
    parser.add_argument('--eps', type=float, default=0.4,
                        help='Epsilon radius for DBSCAN (default: 0.4).')
    args = parser.parse_args()
    main(args.file, args.algorithm, n_clusters=args.clusters, eps=args.eps)
