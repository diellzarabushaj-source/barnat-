update public.lab_indications
set catalog_gaps='[]'::jsonb,
    updated_at=now()
where slug='semundje-hepatike';

insert into public.lab_indication_tests
  (indication_id,lab_test_id,tier,rationale_sq,context_note_sq,sort_order)
select
  i.id,
  t.id,
  'recommended',
  'Ndihmon në vlerësimin e kolestazës dhe dëmtimit të rrugëve biliare.',
  'Interpreto me GGT, bilirubinën dhe kontekstin klinik; ALP mund të ketë edhe burim kockor.',
  13
from public.lab_indications i
join public.lab_tests t
  on t.form_name='Fosfataza alkaline'
 and t.full_name_en='Alkaline Phosphatase'
 and t.is_published=true
 and t.editorial_status='published'
where i.slug='semundje-hepatike'
on conflict (indication_id,lab_test_id) do update set
  tier=excluded.tier,
  rationale_sq=excluded.rationale_sq,
  context_note_sq=excluded.context_note_sq,
  sort_order=excluded.sort_order,
  updated_at=now();

update public.lab_indication_tests lit
set sort_order = case t.form_name
  when 'Bilirubina totale' then 14
  when 'Bilirubina direkte' then 15
  when 'Albuminet' then 16
  else lit.sort_order
end,
updated_at=now()
from public.lab_indications i, public.lab_tests t
where lit.indication_id=i.id
  and lit.lab_test_id=t.id
  and i.slug='semundje-hepatike'
  and t.form_name in ('Bilirubina totale','Bilirubina direkte','Albuminet');
