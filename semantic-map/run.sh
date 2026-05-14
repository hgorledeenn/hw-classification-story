#!/bin/bash
set -e

if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create it with your OPENAI_API_KEY."
    exit 1
fi

mkdir -p output

# Step 0: Normalize poets_full_dataset.csv into the pipeline format
echo "Preparing data..."
python 00-prepare.py --input ../data/df_2000_no_audio.csv --output output/stories.csv

input_file="output/stories.csv"

# Step 2: Create embeddings
echo "Creating embeddings..."
python 02-embed.py --file "$input_file"

processed_file="output/stories_processed.csv"

# Step 3: Cluster
echo ""
echo "Clustering algorithm:"
echo "  1. kmeans (default)"
echo "  2. dbscan"
read -p "Enter choice (1 or 2): " cluster_choice
cluster_choice=${cluster_choice:-1}

if [ "$cluster_choice" = "1" ]; then
    cluster_algorithm="kmeans"
    read -p "Enter number of clusters (default: 10): " num_clusters
    num_clusters=${num_clusters:-10}
    echo "Clustering with k-means ($num_clusters clusters)..."
    python 03-cluster.py --file "$processed_file" --algorithm kmeans --clusters "$num_clusters"
elif [ "$cluster_choice" = "2" ]; then
    cluster_algorithm="dbscan"
    read -p "Enter epsilon radius for DBSCAN (default: 0.4): " eps_val
    eps_val=${eps_val:-0.4}
    echo "Clustering with DBSCAN (eps=$eps_val)..."
    python 03-cluster.py --file "$processed_file" --algorithm dbscan --eps "$eps_val"
else
    echo "Invalid choice. Exiting."
    exit 1
fi

# Step 3b: Generate cluster labels with GPT
echo ""
read -p "Generate descriptive cluster labels with GPT? (y/n, default: y): " gen_labels
gen_labels=${gen_labels:-y}
if [ "$gen_labels" = "y" ] || [ "$gen_labels" = "Y" ]; then
    echo "Generating cluster labels..."
    python 03b-label-clusters.py --file "$processed_file"
fi

# Step 4: Reduce dimensions
echo ""
echo "Dimensionality reduction algorithm:"
echo "  1. umap (default)"
echo "  2. tsne"
echo "  3. pca"
read -p "Enter choice (1, 2, or 3): " dim_choice
dim_choice=${dim_choice:-1}

case "$dim_choice" in
    1) dim_algorithm="umap" ;;
    2) dim_algorithm="tsne" ;;
    3) dim_algorithm="pca" ;;
    *) echo "Invalid choice. Exiting."; exit 1 ;;
esac

echo "Reducing dimensions with $dim_algorithm..."
python 04-reduce-dimensions.py --file "$processed_file" --algorithm "$dim_algorithm"

# Step 5: Launch local visualization
echo "Launching visualization..."
python 05-local-viz.py --file "$processed_file"
