"""
02-embed.py
Author: Dhrumil
Date: 2025-02-10
Description: This python file
    1. reads output/stories.csv
    2. validates that  'id', 'date', 'title', 'text', 'url' are present
    3. embeds title + text using OpenAI API
    4. saves the dataframe to output/stories_processed.csv
"""

import sys
import os
import pandas as pd
import tiktoken
from tqdm import tqdm
from retrying import retry
from joblib import Memory
import openai
from openai import OpenAI
import dotenv
import argparse

tqdm.pandas()
dotenv.load_dotenv()

# Embedding model settings
EMBEDDING_MODEL = "text-embedding-3-small"
CONTEXT_WINDOW_MAX_TOKENS = 8000   # maximum tokens per item
BATCH_SIZE_MAX_TOKENS = 300000     # maximum tokens per API batch request

# Set up OpenAI client and caching
client = OpenAI()
memory = Memory('memcache', verbose=0)


def retry_if_api_error(exception):
    """Return True if we should retry (for API-related errors), False otherwise."""
    print(exception)
    return isinstance(exception, (openai.APIError, openai.APIConnectionError, openai.RateLimitError))


@memory.cache
@retry(retry_on_exception=retry_if_api_error, stop_max_attempt_number=3, wait_fixed=2000)
def get_embeddings(texts, model=EMBEDDING_MODEL):
    """Call the OpenAI API to create embeddings and return them."""
    texts = [text.replace("\n", " ") for text in texts]
    response = client.embeddings.create(input=texts, model=model)
    return [item.embedding for item in response.data]


def process_in_batches(df, column_name, batch_size):
    """
    Process a DataFrame column in batches and return a list of embeddings.

    Parameters:
        df (pd.DataFrame): The input DataFrame.
        column_name (str): The name of the column to embed.
        batch_size (int): The number of texts to process in each batch.

    Returns:
        list: A list of embeddings.
    """
    batches = [df[column_name].iloc[i:i + batch_size]
               for i in range(0, len(df), batch_size)]
    all_embeddings = []
    for batch in tqdm(batches, desc="Processing batches"):
        all_embeddings.extend(get_embeddings(batch.tolist()))
    return all_embeddings


def remove_items_exceeding_token_limit(df, text_column, max_tokens):
    """
    Identifies and removes items that exceed the model's context window.

    Parameters:
        df (pd.DataFrame): The input DataFrame.
        text_column (str): The name of the column to check for token count.
        max_tokens (int): The maximum allowed token count.

    Returns:
        pd.DataFrame: DataFrame with items exceeding token limit removed.
    """
    encoding = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text):
        return len(encoding.encode(text))

    df['token_count'] = df[text_column].apply(count_tokens)

    too_big = df[df['token_count'] > max_tokens].sort_values(by='token_count', ascending=False)

    if not too_big.empty:
        print(f"The following items are too big and exceed the model's context window of {max_tokens} tokens:")
        show_cols = [c for c in ['id', 'title', 'token_count'] if c in too_big.columns]
        print(too_big[show_cols])
        user_input = input("Do you want to continue processing embeddings? (y/n): ")

        if user_input.lower() != 'y':
            sys.exit("Processing aborted by user.")

        # Remove the items that are too big from the DataFrame
        df = df[df['token_count'] <= max_tokens]

    return df


def main(file):
    # 1. Load stories.csv
    df = pd.read_csv(file)

    # 2. Validate that the required columns are present
    required_columns = ['id', 'date', 'title', 'text', 'url']
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        sys.exit(f"Error: The following required columns are missing: {missing}")

    # 3. Identify items that exceed the model's context window
    df = remove_items_exceeding_token_limit(df, 'text', CONTEXT_WINDOW_MAX_TOKENS)

    # 4. Process embeddings in batches
    batch_size = int(BATCH_SIZE_MAX_TOKENS / CONTEXT_WINDOW_MAX_TOKENS)
    print(f"Using batch size of {batch_size}")
    df['embedding'] = process_in_batches(df, 'text', batch_size=batch_size)

    # 5. Save the DataFrame with embeddings to stories_processed.csv
    output_file = os.path.join(os.path.dirname(file), 'stories_processed.csv')
    df.to_csv(output_file, index=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Embed stories from a CSV file.')
    parser.add_argument('--file', type=str, default='output/stories.csv',
                        help='Path to the input CSV file (default: output/stories.csv).')
    args = parser.parse_args()
    main(args.file)
