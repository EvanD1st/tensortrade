import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL", "")
# Using the service_role key allows the backend to bypass RLS and act as an admin
key = os.getenv("SUPABASE_SERVICE_KEY", "")

if not url or not key:
    print("⚠️ WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY missing from backend/.env!")

# Initialize the Admin Supabase client
supabase: Client = create_client(url, key)