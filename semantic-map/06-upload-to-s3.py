import boto3
import os
import argparse

def upload_to_s3(file_path, bucket_name, object_name=None):
    """Uploads a file to an S3 bucket."""
    # If S3 object_name was not specified, use file_path's basename
    if object_name is None:
        object_name = os.path.basename(file_path)
        
    s3_client = boto3.client('s3')
    try:
        print(f"Uploading {file_path} to S3 bucket {bucket_name} as {object_name}...")
        s3_client.upload_file(file_path, bucket_name, object_name)
        print("Upload successful.")
    except Exception as e:
        print(f"Failed to upload {file_path} to S3: {e}")

def main(file_path):
    """Main function to upload a file to S3."""
    # Fixed bucket name
    bucket_name = 'dhrumil-public'
    
    # Get the object name from the file path
    object_name = os.path.basename(file_path)
    
    # Upload the file to S3
    upload_to_s3(file_path, bucket_name, object_name)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Upload a file to the dhrumil-public S3 bucket.')
    parser.add_argument('--file', type=str, required=True,
                        help='Path to the file to upload.')
    args = parser.parse_args()
    main(args.file)
