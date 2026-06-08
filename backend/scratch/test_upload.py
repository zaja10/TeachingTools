import requests

url = "http://127.0.0.1:8000/api/v1/tools/open_index_gen/dataset/upload"

# Let's upload a simple dummy CSV
dummy_csv = b"Trait1,Trait2,Trait3\n1.0,2.0,3.0\n1.5,2.5,3.5\n"
files = {'file': ('dummy.csv', dummy_csv, 'text/csv')}

r = requests.post(url, files=files)
print("Upload status:", r.status_code, r.text)

# Now check traits
r2 = requests.get("http://127.0.0.1:8000/api/v1/tools/open_index_gen/dataset/traits")
print("Traits status:", r2.status_code, r2.json())
