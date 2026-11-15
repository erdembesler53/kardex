-- =====================================================================
-- KARDEX Depo — Supabase kurulumu
-- Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştır → Run
-- =====================================================================

-- 1) Kutular / koliler (her adres bir satır)
create table if not exists public.kardex_kutular (
  adres        text primary key,               -- örn. B-01-05-01
  dolap        text not null check (dolap in ('A','B')),
  raf          int  not null,
  satir        int  not null,
  sira         int  not null,
  icerik       text[] not null default '{}',   -- kutudaki kalemler
  miktar       text,
  musteri      text,                           -- B dolabı (onaylı ürün) için
  onay_tarihi  date,                           -- B dolabı (onaylı ürün) için
  notlar       text,
  guncelleyen  text,
  guncelleme   timestamptz not null default now()
);
create index if not exists kardex_kutular_yer on public.kardex_kutular (dolap, raf, satir, sira);

-- 2) Ayarlar (dolap adları, raf/satır/sıra sayıları) — tek satır
create table if not exists public.kardex_ayarlar (
  id          int primary key default 1 check (id = 1),
  ayar        jsonb not null,
  guncelleyen text,
  guncelleme  timestamptz not null default now()
);
insert into public.kardex_ayarlar (id, ayar) values (1,
  '{"shelves":20,"cab":{"A":{"name":"Sol","desc":"Atölye malzemeleri","rows":8,"depth":2,"kind":"koli"},"B":{"name":"Sağ","desc":"Onaylı ürünler","rows":8,"depth":2,"kind":"kasa"}}}')
on conflict (id) do nothing;

-- 3) Hareket kaydı (kim, ne zaman, neyi değiştirdi)
create table if not exists public.kardex_hareketler (
  id        bigserial primary key,
  adres     text not null,
  islem     text not null,
  detay     text,
  kullanici text,
  zaman     timestamptz not null default now()
);

-- 4) Güvenlik: yalnızca giriş yapmış kullanıcılar okuyup yazabilir
alter table public.kardex_kutular    enable row level security;
alter table public.kardex_ayarlar    enable row level security;
alter table public.kardex_hareketler enable row level security;

drop policy if exists "kutular_oku"   on public.kardex_kutular;
drop policy if exists "kutular_yaz"   on public.kardex_kutular;
drop policy if exists "ayarlar_oku"   on public.kardex_ayarlar;
drop policy if exists "ayarlar_yaz"   on public.kardex_ayarlar;
drop policy if exists "hareket_oku"   on public.kardex_hareketler;
drop policy if exists "hareket_ekle"  on public.kardex_hareketler;

create policy "kutular_oku"  on public.kardex_kutular    for select to authenticated using (true);
create policy "kutular_yaz"  on public.kardex_kutular    for all    to authenticated using (true) with check (true);
create policy "ayarlar_oku"  on public.kardex_ayarlar    for select to authenticated using (true);
create policy "ayarlar_yaz"  on public.kardex_ayarlar    for all    to authenticated using (true) with check (true);
create policy "hareket_oku"  on public.kardex_hareketler for select to authenticated using (true);
create policy "hareket_ekle" on public.kardex_hareketler for insert to authenticated with check (true);

-- 5) Canlı güncelleme (bir telefonda yapılan değişiklik diğerlerinde anında görünür)
do $$ begin
  begin alter publication supabase_realtime add table public.kardex_kutular;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.kardex_ayarlar;  exception when duplicate_object then null; end;
end $$;

-- 6) Örnek kayıtlar (isterseniz silin)
insert into public.kardex_kutular (adres,dolap,raf,satir,sira,icerik) values
 ('A-01-01-01','A',1,1,1, array['ŞAPKALI BURÇ','KUY.ŞAP.BURÇ','ORT.FLANŞ BURÇ']),
 ('A-01-02-01','A',1,2,1, array['TESPİT BURÇ']),
 ('A-01-04-01','A',1,4,1, array['ŞAPKALI KOLON','ŞAP.KAD.KOLON','KUY.KAD.KOLON']),
 ('A-01-05-01','A',1,5,1, array['PNÖMATİK HORTUM']),
 ('A-01-06-01','A',1,6,1, array['ORT.ŞAP.BURÇ','ÜST.ŞAP.BURÇ','BRONZ BURÇ','GRAFİTLİ BURÇ']),
 ('A-01-07-01','A',1,7,1, array['ORTADAN ŞAPKALI KOLON'])
on conflict (adres) do nothing;
