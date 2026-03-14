-- Trusted medical source registry seed
INSERT INTO health_sources (name, base_url, domain, trust_level) VALUES
  ('Mayo Clinic',           'https://www.mayoclinic.org',        'general',     3),
  ('Cleveland Clinic',      'https://my.clevelandclinic.org',    'cardiology',  3),
  ('NIH MedlinePlus',       'https://medlineplus.gov',           'general',     3),
  ('NHS',                   'https://www.nhs.uk',                'general',     3),
  ('ACC/AHA Guidelines',    'https://www.acc.org',               'cardiology',  3),
  ('UpToDate',              'https://www.uptodate.com',          'clinical',    3),
  ('NEJM',                  'https://www.nejm.org',              'research',    2),
  ('Heart Rhythm Society',  'https://www.hrsonline.org',         'cardiology',  3)
ON CONFLICT DO NOTHING;
