-- Include flags that were saved before a question was answered.
create or replace function pick_questions(
  p_subjects text[], p_topics text[], p_status text, p_limit int
) returns setof int language sql security invoker stable as $$
  select q.qid from questions q
  left join user_question_status s on s.qid = q.qid and s.user_id = auth.uid()
  left join flags f on f.qid = q.qid and f.user_id = auth.uid()
  where (p_subjects is null or q.subject_id = any(p_subjects))
    and (p_topics   is null or q.topic_id   = any(p_topics))
    and case p_status
          when 'unused'    then s.qid is null
          when 'incorrect' then s.last_correct = false
          when 'flagged'   then f.qid is not null
          else true end
  order by random() limit p_limit;
$$;

-- Protect attempt integrity even when a client calls the data API directly.
drop policy if exists "own attempts" on attempts;
create policy "read own attempts" on attempts for select to authenticated
  using (user_id = auth.uid());
create policy "insert valid own attempts" on attempts for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
        and qid = any(s.question_ids)
    )
    and correct = coalesce(chosen_index = (select q.answer_index from questions q where q.qid = attempts.qid), false)
  );
create policy "delete own attempts" on attempts for delete to authenticated
  using (user_id = auth.uid());
