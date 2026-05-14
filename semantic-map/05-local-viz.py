import os
import sys
import argparse
import webbrowser
import shutil
from http.server import SimpleHTTPRequestHandler, HTTPServer
import threading
import pandas as pd

def start_server():
    # Start server in the current directory
    server = HTTPServer(('localhost', 8000), SimpleHTTPRequestHandler)
    print("Server started at http://localhost:8000")
    server.serve_forever()

def validate_file(input_file):
    required_columns = ['x', 'y', 'cluster']
    df = pd.read_csv(input_file, nrows=0)  # read only the header
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        sys.exit(f"Error: The following required columns are missing: {missing}. Have you run all pipeline steps?")

def main(input_file, llm_file=None):
    # Validate that the file has the required columns before starting the server
    validate_file(input_file)

    # Get the current working directory (where the script is run from)
    cwd = os.getcwd()

    # Ensure docs directory exists
    docs_dir = os.path.join(cwd, 'docs')
    if not os.path.exists(docs_dir):
        os.makedirs(docs_dir)
        print(f"Created directory: {docs_dir}")

    # Get the filename from the input path
    filename = os.path.basename(input_file)

    # No need to copy files anymore
    print(f"Using file directly from output: {filename}")

    # Copy LLM labels file to output directory so it's served by the HTTP server
    llm_url_param = ''
    if llm_file and os.path.exists(llm_file):
        llm_dest = os.path.join(cwd, 'output', 'df_llm_labels.csv')
        shutil.copy(llm_file, llm_dest)
        llm_url_param = '&llmfile=../output/df_llm_labels.csv'
        print(f"LLM labels file copied for overlay: {llm_dest}")
    elif llm_file:
        print(f"Warning: LLM labels file not found: {llm_file}")

    # Start server in a separate thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Generate URL for the visualization
    # Use outputfile parameter to read directly from output directory
    url = f"http://localhost:8000/docs/index.html?outputfile={filename}{llm_url_param}"
    print(f"Server started! Navigate to: {url}")
    
    # Open the browser automatically
    webbrowser.open(url)
    
    # Keep the main thread running to maintain the server
    try:
        while True:
            # Keep the main thread alive until Ctrl+C
            pass
    except KeyboardInterrupt:
        print("\nShutting down server...")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Launch local visualization server.')
    parser.add_argument('--file', type=str, default='output/stories_processed.csv',
                        help='Path to the CSV file to visualize (default: output/stories_processed.csv).')
    parser.add_argument('--llmfile', type=str, default='../data/df_llm_labels_1.csv',
                        help='Path to LLM labels CSV for overlay (default: ../data/df_llm_labels_1.csv).')
    args = parser.parse_args()
    main(args.file, args.llmfile)
