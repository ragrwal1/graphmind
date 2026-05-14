-- Remove the current member portfolio-link shortcut.
-- Future portfolio company context should be modeled intentionally with company
-- descriptions and explicit context-engineering inputs.

alter table if exists members
  drop column if exists portfolio_company_names;

alter table if exists investors
  drop column if exists portfolio_company_names;
