# Semantic Map

A pipeline for creating semantic maps of text data using embeddings and visualization techniques. This project allows you to embed documents, cluster them, and visualize the results.

## Overview

This project provides a series of scripts that:

1. Download text data from different sources (MediaCloud or MongoDB)
2. Create text embeddings using OpenAI API
3. Cluster the embeddings using K-means
4. Visualize the clusters using t-SNE dimensionality reduction
5. View data locally using the interactive visualization
6. (Optional) Upload the results to an S3 bucket

## Installation

### Prerequisites

- Python 3.10 or higher
- An OpenAI API key
- (Optional) AWS credentials for S3 uploads
- (Optional) MongoDB connection string for campus data

### Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/semantic-map.git
   cd semantic-map
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the root directory with the following content:
   ```
   OPENAI_API_KEY=your_openai_api_key
   MONGO_URI=your_mongodb_uri (if using 01-download-campus.py)
   DB_NAME=your_database_name (if using 01-download-campus.py)
   AWS_ACCESS_KEY_ID=your_aws_access_key (if using 05-upload-to-s3.py)
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key (if using 05-upload-to-s3.py)
   ```

## Usage

The project is organized as a pipeline of scripts that should be run in sequence:

### 1. Download Data

```bash
python 01-download-mediacloud.py
```

This script will download articles from MediaCloud based on your query parameters and save them to `output/stories.csv`. It will have the following columns:

- `id`: Unique identifier
- `date`: Publication date
- `title`: Article title
- `text`: Article text
- `url`: Article URL

### 2. Create Embeddings

```bash
python 02-embed.py --file output/stories.csv
```

This script will:
- Read the CSV file
- Validate the required columns
- Remove items exceeding token limits
- Create embeddings using OpenAI API
- Save the results to a new CSV file with `_with_embeddings.csv` suffix

### 3. Cluster the Embeddings

```bash
python 03-cluster.py --file output/stories_with_embeddings.csv --clusters 15
```

This script will:
- Read the embeddings CSV file
- Apply K-means clustering
- Add a cluster column to the data
- Save the results to a new CSV file with `_with_clusters.csv` suffix

### 4. Visualize the Clusters

```bash
python 04-reduce-dimensions.py --file output/stories_with_clusters.csv
```

This script will:
- Read the CSV file with embeddings
- Apply t-SNE dimensionality reduction
- Add x,y coordinates to the data
- Save the results to a new CSV file with `_2d.csv` suffix

### 5. View Local Visualization

```bash
python 05-local-viz.py --file output/stories_2d.csv
```

This script will:
- Start a local HTTP server on port 8000
- Open your default web browser to the visualization
- Display the interactive visualization of your data clusters
- Continue running until you stop it with Ctrl+C

### 6. (Optional) Upload to S3

```bash
python 06-upload-to-s3.py --file output/stories_2d.csv
```

This script will upload the specified file to the dhrumil-public S3 bucket.

## Visualization

The final `_2d.csv` file can be used for visualization in various tools. The repository includes a simple web visualization in the `docs/` folder that can be accessed by:

1. Running the local visualization server:
   ```bash
   python 05-local-viz.py --file output/stories_2d.csv
   ```

2. Opening your browser to the link provided in the terminal.

You can interact with the visualization until you stop the server with Ctrl+C.
