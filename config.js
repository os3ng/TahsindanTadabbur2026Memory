// Supabase browser configuration.
// This file contains the public/anon key only. Never put a service_role key here.
const SUPABASE_URL = "https://vntjtldwocltnwcxfzbb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZudGp0bGR3b2NsdG53Y3hmemJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODAwOTIsImV4cCI6MjEwNjQ1NjA5Mn0.YsgP9RK4LLV-2dI5YIkFNkLv5VHbnayMhpEEsz7Zuf0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
