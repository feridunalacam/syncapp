# 🚀 GitHub'a Yükleme Rehberi

## 📋 Adım 1: GitHub'da Repository Oluştur

1. **GitHub.com**'a git ve giriş yap
2. Sağ üstteki **"+"** butonuna tıkla → **"New repository"**
3. Repository bilgilerini doldur:
   - **Repository name:** `syncapp` (veya istediğin isim)
   - **Description:** (opsiyonel) "Workout timer app with Spotify integration"
   - **Public** veya **Private** seç
   - ⚠️ **ÖNEMLİ:** "Initialize with README" seçme! (zaten kodların var)
4. **"Create repository"** butonuna tıkla

---

## 📋 Adım 2: Repository URL'ini Kopyala

Oluşturduktan sonra GitHub şöyle bir sayfa gösterir:
```
Quick setup — if you've done this kind of thing before
https://github.com/KULLANICI_ADIN/syncapp.git
```

Bu URL'yi kopyala!

---

## 📋 Adım 3: Terminal'de Bağla ve Yükle

Aşağıdaki komutları sırayla çalıştır:

```bash
# 1. GitHub repository'sini ekle
git remote add origin https://github.com/KULLANICI_ADIN/syncapp.git

# 2. Tüm değişiklikleri hazırla
git add .

# 3. Commit et (eğer yeni değişiklik varsa)
git commit -m "Initial commit - Version 1.0"

# 4. GitHub'a yükle
git push -u origin main
```

---

## ✅ Tamamlandı!

Artık kodların GitHub'da! 🎉

Repository URL'ini herkesle paylaşabilirsin.

