# Kart Tabanlı Strateji Oyunu

## Tanıtım
Tarayıcıda çalışan, 3D, kart tabanlı gerçek zamanlı bir strateji oyunu; ekonomi ve üs geliştirme, otomatik asker savaşları ve kart destesi mekaniklerini birleştirir; tek oyunculu, bilgisayara karşı.

## Teknolojiler
- Three.js
- TypeScript
- Vite
- HTML5 & CSS3

## Canlı Oyun
Bağlantı: yayından sonra eklenecek

## Geliştirici Notu
Oyun adres çubuğunda `?test=1` parametresi ile açıldığında, normal oyuncu kaydına dokunulmadan bütün kartların ve komutanların açık olduğu, 99.999 hesap altını içeren ayrı bir test veritabanı kullanılır. Bu test özelliğini tamamen devre dışı bırakmak için `src/data/matchRules.ts` içerisindeki `allowTestMode` değerini `false` yapmak gerekir.

## Ses Dosyaları

Oyunda kullanılan müzik ve ses efektleri `public/audio/` klasörüne eklenmelidir. Dosyalar eksik olsa bile oyun hatasız (sessiz modda) çalışmaya devam eder.

### Dosya Listesi ve İşlevleri

| Dosya Adı | Tür | Açıklama |
| :--- | :--- | :--- |
| `muzik_menu.mp3` | Müzik | Ana Menü, Sefer Hazırlığı ve Market müzikleri |
| `muzik_hazirlik.mp3` | Müzik | Maç başı (0:00 - 4:00) Hazırlık evresi müziği |
| `muzik_sefer_marsi.mp3` | Müzik | Maç 4:00 Sefer evresi marşı |
| `muzik_savas.mp3` | Müzik | Maç 5:00 Savaş evresi müziği |
| `muzik_cehennem.mp3` | Müzik | Cehennem zorluk derecesinde savaş müziği |
| `muzik_zafer.mp3` | Müzik | Zafer ekranı müziği |
| `muzik_yenilgi.mp3` | Müzik | Yenilgi, beraberlik ve maçtan çıkış müziği |
| `sfx_boru_sefer.mp3` | Efekt | Sefer evresi başlangıç borusu (4:00) |
| `sfx_boru_savas.mp3` | Efekt | Savaş evresi başlangıç borusu (5:00) |
| `sfx_tikla.mp3` | Efekt | Arayüz buton tıklamaları |
| `sfx_kart_sec.mp3` | Efekt | Kart seçimi ve desteye kart ekleme |
| `sfx_bina_yerlestir.mp3` | Efekt | Bina haritaya başarıyla yerleştirildiğinde |
| `sfx_hata.mp3` | Efekt | Yerleştirme hatası ve yetersiz kaynak uyarısı |
| `sfx_insaat_bitti.mp3` | Efekt | Bina inşası tamamlandığında |
| `sfx_asker_hazir.mp3` | Efekt | Asker üretimi tamamlandığında |
| `sfx_isci_hazir.mp3` | Efekt | İşçi üretimi tamamlandığında |
| `sfx_teslim_altin.mp3` | Efekt | İşçi altın teslim ettiğinde |
| `sfx_teslim_odun.mp3` | Efekt | İşçi odun teslim ettiğinde |
| `sfx_ok.mp3` | Efekt | Okçu ve Hisar ok atışı |
| `sfx_top.mp3` | Efekt | Şahi ve Fetih Gemisi top atışı |
| `sfx_tas.mp3` | Efekt | Mancınık-ı Azam taş fırlatması |
| `sfx_kilic.mp3` | Efekt | Yakın dövüş vuruş sesi |
| `sfx_olum.mp3` | Efekt | Asker ölümü |
| `sfx_bina_yikim.mp3` | Efekt | Bina yıkılışı |
| `sfx_duraklat.mp3` | Efekt | Oyunu duraklatma |
| `sfx_devam.mp3` | Efekt | Oyunu sürdürme |
| `sfx_hiz.mp3` | Efekt | Oyun hızlandırma |
| `sfx_satin_al.mp3` | Efekt | Marketten satın alma |
| `sfx_ortam.mp3` | Ortam | Hazırlık evresindeki çevre sesi döngüsü |

### Format Önerisi ve Kurallar
- **Format**: MP3 (44,1 kHz, 128 kbps)
- **Boyut**: Toplam dosya boyutu yaklaşık 15 MB altında olmalıdır.
- **Döngüler**: Müzik ve ortam sesleri için döngü noktalarının (looping) dikişsiz olması tavsiye edilir.

Kaynak ve lisans: (sahibi tarafından doldurulacak)
