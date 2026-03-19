from supabase import create_client, Client
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str          # service_role key for backend
    jwt_secret: str
    anthropic_key: str

    class Config:
        env_file = ".env"

settings = Settings()
supabase: Client = create_client(settings.supabase_url, settings.supabase_key)

create or replace function public.recompute_irs_on_change()
returns trigger
language plpgsql
as $$
begin
  -- Placeholder trigger body for MVP scaffolding.
  perform 1;
  return new;
end;
$$;

# Before (in-memory)
def create_from_dot(self, dot_number: str) -> dict:
    for c in self._carriers:
        if c["dot_number"] == dot_number:
            raise ValueError("DOT already in roster")

# After (Supabase)
from app.config import supabase

def create_from_dot(self, dot_number: str, org_id: str) -> dict:
    existing = supabase.table("carriers")\
        .select("id")\
        .eq("dot_number", dot_number)\
        .eq("organization_id", org_id)\
        .execute()
    if existing.data:
        raise ValueError("DOT already in roster")
    # ... insert new carrier
    result = supabase.table("carriers").insert({...}).execute()
    return result.data[0]
