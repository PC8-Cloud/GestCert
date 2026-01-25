import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://hwsybalmoimcgochzmic.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3c3liYWxtb2ltY2dvY2h6bWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MjMxNzQsImV4cCI6MjA4NDE5OTE3NH0.wbjOy19PZXLq7w36HLy6Q76KWPQNWeLoeoR3Umsa1KQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
