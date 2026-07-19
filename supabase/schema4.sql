-- =====================================================
-- المرحلة الرابعة: تغيير كلمات المرور من داخل النظام (للمالك)
-- =====================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function admin_set_password(target_user uuid, new_password text)
returns void
language plpgsql security definer
set search_path = public, extensions, auth
as $$
begin
  if coalesce(my_role(), '') <> 'owner' then
    raise exception 'غير مسموح — هذه العملية للمالك فقط';
  end if;
  if length(new_password) < 6 then
    raise exception 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = target_user;
  if not found then
    raise exception 'المستخدم غير موجود';
  end if;
end $$;

revoke all on function admin_set_password(uuid, text) from public, anon;
grant execute on function admin_set_password(uuid, text) to authenticated;
