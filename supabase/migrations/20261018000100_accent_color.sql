-- The accent color is used for the first time by the layout "Modern" (M13). Stored themes still carry the former,
-- never visible default (red, rejected by the user); switch exactly that value to the new default.
update public.settings
set theme = jsonb_set(theme, '{colors,accent}', '"#1F5F74"')
where theme #>> '{colors,accent}' = '#B3261E';
