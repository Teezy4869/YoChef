-- =============================================================================
-- Auto-moderate normal comments and hold sensitive/spam comments for review.
--
-- Normal comments are automatically set to 'approved' on insert or content edit.
-- Comments matching sensitive keywords, profanity, links, or phone-number spam
-- stay 'pending' so moderators can review them in the moderation queue.
-- =============================================================================

create table private.comment_review_rules (
  id         serial primary key,
  pattern    text not null unique,
  match_mode text not null check (match_mode in ('folded_word', 'raw_word', 'raw_regex')),
  note       text
);

revoke all on table private.comment_review_rules from public, anon, authenticated;

insert into private.comment_review_rules (pattern, match_mode, note) values
  -- Links / contact spam
  ('https?://|www\.', 'raw_regex', 'URL'),
  ('(^|[^a-z0-9-])[a-z0-9-]+\.(com|vn|net|org|xyz|info|shop|vip)($|[^a-z0-9-])', 'raw_regex', 'Domain spam'),
  ('(t\.me|zalo\.me|bit\.ly|tinyurl\.com)/', 'raw_regex', 'Shortlink / chat invite'),
  ('(^|[^0-9])0[35789][0-9]([ .-]?[0-9]){7,8}($|[^0-9])', 'raw_regex', 'Phone number'),

  -- Vietnamese profanity / sensitive terms (matched with diacritics to avoid food-word false positives)
  ('lồn', 'raw_word', 'Profanity'),
  ('buồi', 'raw_word', 'Profanity'),
  ('cặc', 'raw_word', 'Profanity'),
  ('địt', 'raw_word', 'Profanity'),
  ('đéo', 'raw_word', 'Profanity'),
  ('đụ', 'raw_word', 'Profanity'),
  ('đĩ', 'raw_word', 'Profanity'),
  ('phò', 'raw_word', 'Profanity'),
  ('chịch', 'raw_word', 'Profanity'),
  ('nứng', 'raw_word', 'Profanity'),
  ('dâm', 'raw_word', 'Sexual'),
  ('hiếp', 'raw_word', 'Violence'),
  ('giết', 'raw_word', 'Violence'),
  ('tự tử', 'raw_word', 'Self-harm'),
  ('chết mẹ', 'raw_word', 'Profanity'),
  ('mẹ mày', 'raw_word', 'Insult'),
  ('cha mày', 'raw_word', 'Insult'),
  ('bố mày', 'raw_word', 'Insult'),
  ('con chó', 'raw_word', 'Insult'),
  ('óc chó', 'raw_word', 'Insult'),
  ('đồ chó', 'raw_word', 'Insult'),
  ('cứt', 'raw_word', 'Profanity'),
  ('ỉa', 'raw_word', 'Profanity'),
  ('đái', 'raw_word', 'Profanity'),
  ('súc vật', 'raw_word', 'Insult'),
  ('khốn nạn', 'raw_word', 'Insult'),
  ('mất dạy', 'raw_word', 'Insult'),
  ('rác rưởi', 'raw_word', 'Insult'),
  ('vãi lồn', 'raw_word', 'Profanity'),
  ('vãi cặc', 'raw_word', 'Profanity'),
  ('ngu lồn', 'raw_word', 'Profanity'),

  -- Abbreviations, English profanity & spam phrases (matched on accent-folded text)
  ('dm', 'folded_word', 'Abbreviation profanity'),
  ('dmm', 'folded_word', 'Abbreviation profanity'),
  ('dkm', 'folded_word', 'Abbreviation profanity'),
  ('vcl', 'folded_word', 'Abbreviation profanity'),
  ('vkl', 'folded_word', 'Abbreviation profanity'),
  ('clm', 'folded_word', 'Abbreviation profanity'),
  ('cc', 'folded_word', 'Abbreviation profanity'),
  ('vl', 'folded_word', 'Abbreviation profanity'),
  ('fuck', 'folded_word', 'English profanity'),
  ('fucking', 'folded_word', 'English profanity'),
  ('shit', 'folded_word', 'English profanity'),
  ('bitch', 'folded_word', 'English profanity'),
  ('asshole', 'folded_word', 'English profanity'),
  ('dick', 'folded_word', 'English profanity'),
  ('pussy', 'folded_word', 'English profanity'),
  ('porn', 'folded_word', 'Sexual'),
  ('sex', 'folded_word', 'Sexual'),
  ('xxx', 'folded_word', 'Sexual'),
  ('slut', 'folded_word', 'Insult'),
  ('whore', 'folded_word', 'Insult'),
  ('tai xiu', 'folded_word', 'Gambling spam'),
  ('ca do', 'folded_word', 'Gambling spam'),
  ('co bac', 'folded_word', 'Gambling spam'),
  ('lo de', 'folded_word', 'Gambling spam'),
  ('lua dao', 'folded_word', 'Scam'),
  ('ib zalo', 'folded_word', 'Contact spam'),
  ('inbox zalo', 'folded_word', 'Contact spam'),
  ('kiem tien online', 'folded_word', 'Spam'),
  ('tuyen cong tac vien', 'folded_word', 'Spam');

create or replace function private.comment_needs_review(p_content text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.comment_review_rules r
    where (
      r.match_mode = 'raw_regex'
      and lower(p_content) ~ r.pattern
    )
    or (
      r.match_mode = 'raw_word'
      and lower(p_content) ~ ('\m' || r.pattern || '\M')
    )
    or (
      r.match_mode = 'folded_word'
      and public.fold_vi(p_content) ~ ('(^|[^a-z0-9])' || r.pattern || '($|[^a-z0-9])')
    )
  );
$$;

revoke all on function private.comment_needs_review(text) from public, anon, authenticated;

create or replace function private.auto_moderate_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only apply automatic moderation to client writes; moderators/admins/seeds keep explicit status.
  -- (Use current_setting('role', true) because this function is SECURITY DEFINER.)
  if current_setting('role', true) not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.content is distinct from old.content and old.status <> 'rejected') then
    if private.comment_needs_review(new.content) then
      new.status := 'pending';
    else
      new.status := 'approved';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.auto_moderate_comment() from public, anon, authenticated;

-- Named z_ so it runs after reset_status_on_edit on UPDATE.
create trigger z_auto_moderate_comment
  before insert or update on public.comments
  for each row execute function private.auto_moderate_comment();
