import requests

def test_download():
    node_id = "b299e673-b86c-450f-81b6-94073d5bc213"
    url = f"http://localhost:8000/api/vfs/nodes/{node_id}/download"
    headers = {
        "Cookie": "fastapiusersauth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MTM3ZTMzZC1mNDdhLTQwYTYtOTcxYy1jMmIwMTM3YmU0NTIiLCJleHAiOjE3NTg1NTk3NjcsImlhdCI6MTc1ODU1NjE2Nywic2NvcGUiOiJhbXIiLCJyZWZyZXNoIjoiZTNhNmJkMTUtNTIxYS00MDc3LWE0NTQtM2VhNWYyZjZkZDgzIn0.0qhsmO5VTjmOZiNME2CaHneVLC1zk-8E1Ccr8Gjy1jE"
    }
    
    try:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            print("Status: 200 OK")
            print("Content Preview:")
            print(resp.text[:500])
        else:
            print(f"Status: {resp.status_code}")
            print(resp.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_download()
