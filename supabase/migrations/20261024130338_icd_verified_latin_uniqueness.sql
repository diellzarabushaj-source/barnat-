-- A newly approved proposal cannot silently replace an already reviewed Latin title.
create unique index icd_memory_latin_verified_v1
 on public.icd_query_memory_v1(classification,code)
 where scope='global' and kind='latin' and status='verified';
