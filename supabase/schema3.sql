-- =====================================================
-- المرحلة الثالثة: سجل الحركات (تدقيق مضاد للتلاعب)
-- كل إضافة/تعديل/حذف تُسجل تلقائياً من قاعدة البيانات نفسها
-- =====================================================

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb
);

-- دالة التسجيل: تعمل من الخادم ولا يمكن تجاوزها من التطبيق
create or replace function audit_trigger() returns trigger
language plpgsql security definer as $$
declare uname text;
begin
  select name into uname from profiles where id = auth.uid();
  insert into audit_log(user_id, user_name, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    coalesce(uname, 'غير معروف'),
    lower(TG_OP),
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id::text else new.id::text end,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- تفعيل التسجيل على كل الجداول
do $$
declare t text;
begin
  foreach t in array array['materials','movements','customers','mixtures','mixture_items',
    'invoices','expenses','vehicles','partners','partner_withdrawals','employees','salaries','profiles']
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;

-- الحماية: القراءة للمالك فقط — ولا سياسات تعديل أو حذف إطلاقاً (سجل غير قابل للتلاعب)
alter table audit_log enable row level security;
drop policy if exists "audit owner read" on audit_log;
create policy "audit owner read" on audit_log for select to authenticated
  using (my_role() = 'owner');
