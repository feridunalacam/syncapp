# Tema Sistemi Kullanım Rehberi

## Renk Değiştirmek İçin

### 1. Tema Dosyalarını Düzenle

Tüm renkler iki dosyada tanımlı:
- `src/themes/lightTheme.js` - Light mode renkleri
- `src/themes/darkTheme.js` - Dark mode renkleri

### 2. Renk Değiştirme Örnekleri

#### Örnek 1: Primary Button Rengini Değiştirmek

**Light Mode:**
```javascript
// src/themes/lightTheme.js
export const lightTheme = {
  // ...
  buttonPrimary: '#0d6efd', // Burayı değiştir (örn: '#ff0000')
  // ...
};
```

**Dark Mode:**
```javascript
// src/themes/darkTheme.js
export const darkTheme = {
  // ...
  buttonPrimary: '#0d6efd', // Burayı değiştir
  // ...
};
```

#### Örnek 2: Text Rengini Değiştirmek

**Light Mode:**
```javascript
// src/themes/lightTheme.js
export const lightTheme = {
  // ...
  text: '#1f2937', // Ana metin rengi
  textSecondary: '#6b7280', // İkincil metin rengi
  textTertiary: '#9ca3af', // Üçüncül metin rengi
  // ...
};
```

**Dark Mode:**
```javascript
// src/themes/darkTheme.js
export const darkTheme = {
  // ...
  text: '#ffffff', // Ana metin rengi (beyaz)
  textSecondary: '#d1d5db', // İkincil metin rengi
  textTertiary: '#9ca3af', // Üçüncül metin rengi
  // ...
};
```

#### Örnek 3: Background Rengini Değiştirmek

**Light Mode:**
```javascript
// src/themes/lightTheme.js
export const lightTheme = {
  // ...
  background: '#ffffff', // Ana arka plan
  surface: '#f6f7fb', // Yüzey rengi
  card: '#ffffff', // Kart rengi
  cardSecondary: '#f9fafb', // İkincil kart rengi
  // ...
};
```

**Dark Mode:**
```javascript
// src/themes/darkTheme.js
export const darkTheme = {
  // ...
  background: '#000000', // Ana arka plan (siyah)
  surface: '#1a1a1a', // Yüzey rengi
  card: '#1a1a1a', // Kart rengi
  cardSecondary: '#2a2a2a', // İkincil kart rengi
  // ...
};
```

### 3. Mevcut Tema Renkleri

#### Backgrounds (Arka Planlar)
- `background` - Ana arka plan
- `surface` - Yüzey rengi
- `card` - Kart rengi
- `cardSecondary` - İkincil kart rengi

#### Text (Metin)
- `text` - Ana metin rengi
- `textSecondary` - İkincil metin rengi
- `textTertiary` - Üçüncül metin rengi
- `textInverse` - Ters metin rengi (koyu arka plan üzerinde beyaz)

#### Borders (Kenarlıklar)
- `border` - Ana kenarlık rengi
- `borderLight` - Açık kenarlık rengi
- `borderDark` - Koyu kenarlık rengi

#### Buttons (Butonlar)
- `buttonPrimary` - Primary buton rengi
- `buttonSecondary` - Secondary buton rengi
- `buttonDisabled` - Disabled buton rengi
- `buttonText` - Buton metin rengi
- `buttonTextSecondary` - Secondary buton metin rengi

#### Status (Durum)
- `success` - Başarı rengi (yeşil)
- `error` - Hata rengi (kırmızı)
- `warning` - Uyarı rengi (turuncu)
- `info` - Bilgi rengi (mavi)

#### Special (Özel)
- `accent` - Vurgu rengi
- `accentLight` - Açık vurgu rengi
- `divider` - Ayırıcı çizgi rengi

### 4. Component'lerde Tema Kullanımı

Component'lerde tema kullanmak için:

```javascript
import { useTheme } from '../../context/ThemeContext';

function MyComponent() {
  const { theme } = useTheme();
  
  return (
    <View style={{ backgroundColor: theme.background }}>
      <Text style={{ color: theme.text }}>
        Merhaba
      </Text>
    </View>
  );
}
```

### 5. Font Boyutları ve Spacing

Font boyutları ve spacing değerleri de tema dosyalarında:

```javascript
// Font boyutları
fontSize: {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 36,
}

// Spacing (boşluklar)
spacing: {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
}
```

### 6. Önemli Notlar

1. **Her zaman hem light hem dark mode'u güncelle** - Kullanıcılar tema değiştirebilir
2. **Kontrast oranlarına dikkat et** - Dark mode'da text'lerin okunabilir olduğundan emin ol
3. **Platform marka renkleri değiştirme** - `PlatformContext.js`'deki renkler (Spotify yeşili vb.) marka renkleri olduğu için değiştirilmemeli
4. **Gradient renkler** - TimerDesign.js'deki gradient renkler görsel öğeler olduğu için tema sistemine dahil değil

### 7. Hızlı Referans

**En çok kullanılan renkler:**
- `theme.background` - Arka plan
- `theme.text` - Metin
- `theme.card` - Kart arka planı
- `theme.border` - Kenarlık
- `theme.buttonPrimary` - Primary buton
- `theme.textSecondary` - İkincil metin
- `theme.iconPrimary` - İkon rengi
- `theme.accent` - Vurgu rengi

**En çok kullanılan spacing:**
- `theme.spacing.xs` - 4px
- `theme.spacing.sm` - 8px
- `theme.spacing.md` - 12px
- `theme.spacing.lg` - 16px
- `theme.spacing.xl` - 20px

**En çok kullanılan font boyutları:**
- `theme.fontSize.sm` - 12px
- `theme.fontSize.base` - 14px
- `theme.fontSize.md` - 16px
- `theme.fontSize.lg` - 18px
- `theme.fontSize.xl` - 20px

