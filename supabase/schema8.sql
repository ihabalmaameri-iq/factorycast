-- =====================================================
-- المرحلة الثامنة: تسديد الفواتير على شكل دفعات
-- =====================================================

create table if not exists payments (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  method text not null default 'نقد',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_idx on payments(invoice_id);

-- ترحيل: كل فاتورة مسددة سابقاً (بلا دفعات) تُسجَّل لها دفعة واحدة بكامل المبلغ
insert into payments (invoice_id, date, amount, method, note)
select v.id, v.date, v.total, 'نقد', 'تسديد سابق (ترحيل تلقائي)'
  from invoices v
 where v.paid = true
   and v.total > 0
   and not exists (select 1 from payments p where p.invoice_id = v.id);

-- الصلاحيات + سجل التدقيق
alter table payments enable row level security;

do $$
begin
  execute 'drop policy if exists "auth all payments" on payments';
  execute 'create policy "auth all payments" on payments for all to authenticated using (true) with check (true)';
  execute 'drop trigger if exists audit_payments on payments';
  execute 'create trigger audit_payments after insert or update or delete on payments for each row execute function audit_trigger()';
end $$;
