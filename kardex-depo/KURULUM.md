# KARDEX Depo — Kurulum (Supabase + GitHub Pages)

## 1. Supabase projesi
1. supabase.com → **New project** → ad: `kardex-depo`, bölge: Frankfurt (eu-central-1).
2. **SQL Editor → New query** → `supabase.sql` dosyasının tamamını yapıştır → **Run**.
3. **Authentication → Users → Add user → Create new user**: depoyu kullanacak her kişi için e-posta + şifre (“Auto confirm user” işaretli).
4. **Authentication → Sign In / Providers → Email**: “Allow new users to sign up” kapat (yalnız sizin eklediğiniz kişiler girsin).
5. **Project Settings → API**: `Project URL` ve `anon public` anahtarını kopyala.

## 2. config.js
`config.js` içindeki iki değeri doldur:
```js
supabaseUrl: "https://xxxx.supabase.co",
supabaseAnonKey: "eyJhbGciOi..."   // anon public — service_role ASLA değil
```

## 3. GitHub
1. github.com → **New repository** → ad: `kardex-depo` → Public → Create.
2. **Add file → Upload files** → bu klasördeki tüm dosyaları sürükle → **Commit changes**.
3. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main` / `(root)` → **Save**.
4. 1–2 dk sonra adres: `https://KULLANICI-ADINIZ.github.io/kardex-depo/`

## 4. Telefona uygulama olarak ekle
- Android (Chrome): ⋮ → **Uygulamayı yükle / Ana ekrana ekle**
- iPhone (Safari): Paylaş → **Ana Ekrana Ekle**

## 5. Stok girişi
- Tek tek: rafı aç → kutuya dokun → içerik yaz → Kaydet.
- Toplu: `kardex-sablon.csv` dosyasını Excel’de doldur (İçerik, Miktar; birden çok kalem `|` ile) → CSV kaydet → uygulamada **Liste → İçe aktar**.

## Güncelleme
Dosyada değişiklik olursa GitHub’da ilgili dosyayı yeniden yükleyin (Upload files → Commit). Veriler Supabase’de olduğu için kaybolmaz.
