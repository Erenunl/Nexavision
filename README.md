# NEXAVISION Discord Bot

Bot birbiriyle entegre yarışma modülleri içerir:

1. Ülke rollerinin kurulması → ülke başvurusu → admin onayı → Discord rolü ve aktif assignment
2. Aktif ülke temsilcisinin YouTube şarkı başvurusu → otomatik kontrol → admin onayı → resmi şarkı
3. Adminin önceki bir kullanıcı mesajını normal mesaj veya embed olarak başka kanala duyurması
4. Yerel MP3 dosyalarını Discord Stage kanalında karışık ve sürekli çalan bekleme müziği
5. Kalıcı yarışma durum paneli, UTC deadline ve tek-sefer reminder sistemi
6. Gizli Eurovision oylaması, admin completion kontrolü ve auditli ballot işlemleri
7. Onayla birlikte otomatik kilitlenen, admin kontrollü resmi şarkı entry sistemi

## Gereksinimler

- Node.js 20 veya üzeri
- Bir Discord bot uygulaması
- YouTube Data API v3 anahtarı
- Botun erişebildiği özel data kanalı: `1556686336109314148`

Discord Developer Portal'da **Message Content Intent** ve **Server Members Intent** seçeneklerini etkinleştirin. Botu `bot` ve `applications.commands` scope'larıyla davet edin.

Botun ilgili kanallarda/rollerde en az şu izinleri olmalı:

- View Channel
- Send Messages
- Embed Links
- Read Message History
- Manage Messages (şarkı başvuru kanalını temizlemek için)
- Manage Roles (onaylanan kullanıcıya ülke rolünü vermek için)
- Attach Files ve Embed Links (`/duyuru` hedeflerinde gerektiğinde)
- View Channel, Connect, Speak ve Mute Members (Stage kanalında konuşmacı olabilmek için)

Botun Discord rolü, oluşturulan ülke rollerinin üzerinde olmalıdır. Data kanalı normal üyelerden gizlenmeli; bot bu kanalda mesaj okuyabilmeli, gönderebilmeli ve kendi mesajını düzenleyebilmelidir.

## Kurulum

```powershell
Copy-Item .env.example .env
npm ci
npm run build
npm start
```

`.env` yalnızca gizli değerleri içerir:

```dotenv
DISCORD_TOKEN=...
YOUTUBE_API_KEY=...
```

SQLite veritabanı ilk çalıştırmada `data/nexavision.sqlite` olarak oluşturulur. Migration otomatik çalışır; manuel SQL komutu gerekmez.

## `/ayar` yapılandırması

Sunucu sahibi veya ilk kurulumda Discord `Administrator` yetkisi olan biri `/ayar` komutunu açar. Admin rolü tanımlandıktan sonra ayarlara bu rol ve sunucu sahibi erişebilir.

Kanal Ayarları bölümünde:

- Şarkı Gönderim Kanalı
- Admin Onay Kanalı — hem ülke hem şarkı başvuruları için ortaktır
- Resmi Şarkılar Kanalı
- Log Kanalı
- Ülke Listesi Kanalı
- Ülke Başvuru Kanalı
- Sahne Kanalı — seçici yalnızca Stage kanallarını gösterir

Yetki Ayarları bölümünde admin rolü; Şarkı Kuralları bölümünde maksimum görüntülenme limiti bulunur.

Sunucu ayarlarının source of truth'u data kanalındaki tek `FSC_CONFIG:<guildId>` mesajıdır. Eski config mesajları otomatik olarak v3 yapısına okunur. Kanal/rol veya kalıcı panel mesajı silinirse bot güvenli biçimde hata verir; panel mesajları restart, kanal ayarı veya `/ülkeayarla` sırasında yeniden oluşturulur.

## `/ülkeayarla`

```text
/ülkeayarla
```

Komut sabit 50 ülkenin `🇩🇰 Danimarka` biçimindeki dekoratif Discord rollerini oluşturur ve role ID mapping'ini data-channel config mesajında saklar.

- Mevcut doğru isimli rolleri yeniden kullanır.
- Yarıda kalan kurulumda yalnızca eksik rolleri oluşturur.
- Tüm 50 rol doğrulanmadan `countryRolesInitialized` değerini tamamlanmış yapmaz.
- Mapping'deki rol silinmiş veya yeniden adlandırılmışsa komut eksik rolü onarır.
- Kurulum zaten sağlamsa duplicate rol oluşturmaz.

Discord rate limit kuyruğu discord.js tarafından yönetilir. 50 rolün oluşturulması biraz zaman alabilir.

## Ülke başvuru ve onay akışı

Ülke Başvuru Kanalındaki kalıcı panel 50 ülkeyi en fazla 25 seçenek içeren iki select menu'ye böler. Aktif temsilcisi bulunan ülkeler listeden çıkarılır.

Başvuru sırasında database atomik olarak şunları kontrol eder:

- Kullanıcının aktif assignment'ı
- Kullanıcının başka pending başvurusu
- Ülkenin aktif temsilcisi
- Ülkenin başka pending başvurusu

Admin onayında durum yeniden kontrol edilir. Ardından ülke rolü kullanıcıya verilir; yalnızca rol başarıyla verildikten sonra assignment ve `APPROVED` durumu aynı database transaction'ında oluşturulur. Transaction başarısız olursa bu işlemde eklenen rol geri alınır.

Onay sonrasında ülke listesi ve başvuru paneli aynı kalıcı mesajlar düzenlenerek güncellenir ve kullanıcıya DM gönderilir. Kullanıcı sunucudan ayrılmışsa, rol silinmişse veya bot rolü veremiyorsa başvuru pending kalır ve admin/log kanalı hata alır.

## Şarkı sistemi entegrasyonu

Şarkı sistemi artık eski manuel participant kaydını kullanmaz. Kullanıcının `country_assignments` tablosunda aktif assignment'ı yoksa şarkı gönderemez.

YouTube kontrolleri:

- Yalnızca `youtube.com/watch?v=...` ve `youtu.be/...`
- Shorts, private/silinmiş video ve aktif/planlanmış livestream reddi
- Yapılandırılmış görüntülenme limitinin altında olma
- Resmi video/ülke tekrarının ve aynı kullanıcının ikinci pending başvurusunun engellenmesi
- Admin onayında videonun ve görüntülenme sayısının yeniden kontrolü

## `/duyuru`

```text
/duyuru kanal:#duyurular embed:true
/duyuru kanal:#duyurular embed:false
```

Komut kullanıldığı kanaldaki, komuttan önce gönderilmiş son uygun kullanıcı mesajını kaynak kabul eder. Bot/webhook/system/boş mesajlar atlanır; kaynak mesaj silinmez.

- `embed:false`: Metni normal Discord mesajı olarak gönderir. Uzun metinler eksiksiz biçimde 2000 karakterlik mesajlara bölünür.
- `embed:true`: Metni description olarak kullanır. 4096 karakteri aşan içerik sessizce kesilmeden birden fazla embed mesajına bölünür. İlk uygun görsel embed image olur.
- Attachment'lar yeniden yüklenir. Bir dosya aktarılamazsa diğer duyuru içeriği korunur ve dosya adı admine bildirilir.
- Kullanıcı ve kanal mention'ları görünür; `@everyone`, `@here` ve rol pingleri varsayılan olarak çalıştırılmaz.
- Aynı kaynak/hedef duyurusu eşzamanlı işleniyorsa ikinci komut güvenli şekilde reddedilir.

Komut mevcut admin rolü yetkilendirmesini kullanır. Sunucu sahibi her zaman; admin rolü henüz yoksa gerçek `Administrator` yetkisi olanlar da kullanabilir. Yeni `.env` veya `/ayar` alanı gerekmez.

## Stage / bekleme müziği

MP3 dosyalarını proje kökündeki `music/` klasörüne doğrudan ekleyin. Alt klasörler taranmaz; yalnızca `.mp3` uzantılı yerel dosyalar kullanılır. MP3 dosyaları `.gitignore` kapsamındadır.

```text
/sahnebasla
/sahnedur
/sahnedevam
/sahnebit
```

- `/sahnebasla`: `/ayar` ile seçilen Stage kanalına konuşmacı olarak katılır, listeyi karıştırır ve kesintisiz çalmaya başlar.
- `/sahnedur`: sesi mevcut parça konumunda duraklatır; bağlantı ve sıra korunur.
- `/sahnedevam`: yalnızca duraklatılmış oturumu kaldığı yerden sürdürür.
- `/sahnebit`: oynatıcıyı, FFmpeg sürecini, bağlantıyı ve bellekteki oturumu temizler.

Her sunucuda en fazla bir oturum bulunur. Liste bittiğinde yeniden karıştırılır ve birden fazla parça varsa aynı şarkı iki tur sınırında arka arkaya çalmaz. Bozuk dosyalar loglanıp atlanır; bağlantı kurtarılamazsa oturum `STOPPED` durumuna temizlenir. Bot yeniden başladığında eski oturum sürdürülmez. Sistem YouTube veya başka bir streaming kaynağı kullanmaz.

Ses desteği `@discordjs/voice`, `opusscript` ve platforma uygun yerel FFmpeg ikilisi sağlayan `@ffmpeg-installer/ffmpeg` paketlerine dayanır.

## Yarışma durumu ve takvim

`/ayar → Kanal Ayarları → Yarışma Durum Kanalı` seçildiğinde bot tek bir kalıcı embed oluşturur. Temsilci, resmi/pending/kilitli şarkı, tamamlanan oy ve deadline bilgileri yeni mesaj spamlenmeden editlenir. Mesaj silinirse veya bot yeniden başlarsa yeniden oluşturulur.

`/ayar → Yarışma Takvimi` altında şarkı teslimi ve oylama deadline'ları `YYYY-MM-DD HH:mm` biçiminde **UTC** girilir. Discord bunları her kullanıcıya yerel saatle gösterir. Alanı temizlemek için modal içine `sil` yazılabilir.

Deadline reminder sistemi her dakika kontrol edilir ve 24, 6 ve 1 saat pencerelerinde yalnızca bir kez DM gönderir. İşlenen reminder kayıtları SQLite'ta tutulur. Restart sonrasında eski pencereler topluca gönderilmez; yalnızca hâlâ anlamlı en yakın pencere çalışır.

```text
/hatirlat sarki
/hatirlat oy
```

Manuel reminder komutları admin-only'dir ve kontrol edilen, gönderilen ve DM'i başarısız olan kullanıcı sayılarını ephemeral olarak döndürür.

## Gizli Eurovision oylaması

```text
/oylama ac
/oylama kapat
/oyla
/oykontrol
/oykontrol kullanici:@kullanıcı
/oysifirla kullanici:@kullanıcı
```

`/oyla`, aktif temsilciyi kendi ülkesinden ve resmi şarkısı olmayan ülkelerden otomatik olarak koruyan 10 adımlı ephemeral seçim akışıdır. Puan seti `12, 10, 8, 7, 6, 5, 4, 3, 2, 1` olmalıdır. Submit sırasında bütün kurallar server-side yeniden doğrulanır. Kullanıcı deadline geçmeden mevcut pusulasını görebilir ve güvenli çalışma kopyası üzerinden düzenleyebilir; yeni pusula submit edilene kadar önceki gönderilmiş oy geçerli kalır.

`/oykontrol` yalnızca completion durumunu gösterir, sonuç veya toplam puan göstermez. Kullanıcı parametresiyle tam pusulayı görmek ayrıca audit loguna yazılır. `/oysifirla` kalıcı silme öncesinde butonla onay ister. Normal kullanıcılar birbirlerinin oylarını hiçbir yerde göremez.

## Resmi şarkı kilidi

Yeni onaylanan resmi şarkılar otomatik `locked` olur. Kilitli ülkenin temsilcisi yeni YouTube linki gönderemez.

```text
/sarkikilidi ulke:Danimarka durum:acik
/sarkikilidi ulke:Danimarka durum:kilitli
```

Admin kilidi açtıktan sonra temsilci yeni başvuru yapabilir. Yeni başvuru onaylandığında eski resmi kayıt ve yeni kayıt tek database transaction'ında değiştirilir; yeni resmi duyuru gönderilemezse işlem geri alınarak eski entry geri yüklenir.

## Sonuç gecesi ve canlı scoreboard

`/ayar` içinden **Sonuç Kanalı**, **Scoreboard Kanalı** ve isteğe bağlı **Kazanan Rolü** ayarlanır.

```text
/sonuc hazirla
/sonucbaslat
/sonraki
/sonucdur
/sonucdevam
/sonucbitir
```

`/sonuc hazirla`, oylama kapalıyken SUBMITTED ballot'lardan immutable snapshot ve kalıcı, rastgele reveal order oluşturur. Sonraki ballot değişiklikleri aktif sonuç oturumunu etkilemez. `/sonraki` transaction içinde index'i yalnızca bir kez ilerletir, ülkenin tam puan setini açıklar ve tek scoreboard mesajını günceller. Eşitlik sırası toplam puan, 12 sayısı, 10 sayısı, oy veren ülke sayısı ve ülke kodudur. Son ballot sonrası kazananın resmi şarkısı duyurulur ve ayarlanmışsa temsilciye Kazanan Rolü verilir.

RUNNING/PAUSED state, sıra ve index SQLite'ta tutulur. Restart sonrasında scoreboard açıklanmış ballot miktarından yeniden kurulur. `/sonucbitir` erken bitirme öncesinde confirmation ister.

## Şimdi Çalıyor

`/ayar → Şimdi Çalıyor Kanalı`, Stage müziği için tek bir kalıcı mesaj kullanır. `Artist - Song.mp3` dosya adı sanatçı ve şarkı olarak ayrılır; parse edilemeyen isim güvenli biçimde tam dosya adına döner. Parça değişimi, pause, resume, stop ve restart mesajı editler; yeni mesaj spamlenmez.

## Ülke admin yönetimi

```text
/ulke temsilcikaldir ulke:Danimarka
/ulke temsilcidegistir ulke:Danimarka kullanici:@YeniKullanıcı
/ulke basvuruac
/ulke basvurukapat
```

Kaldırma confirmation ister; assignment inactive olur, ülke rolü kaldırılır ve paneller sync edilir. Değiştirmede yeni kullanıcı/rol önce doğrulanır, assignment transaction ile değiştirilir ve gerçek eski temsilcinin rolü kaldırılır. Başvurular kapalıyken kalıcı panel açıklama gösterir ve dropdown üretmez.

## Şarkı değişiklik talebi

```text
/sarkidegistir youtube_url:https://youtu.be/...
```

Yalnızca kilitli resmi şarkısı olan temsilci kullanabilir ve voting açıkken yeni talep oluşturulamaz. URL, YouTube erişimi, livestream, görüntülenme ve duplicate kontrolleri mevcut submission validator/service üzerinden çalışır. Ülke başına tek PENDING talep vardır.

Admin onayı eski entry'yi history olarak saklar, yeni entry'yi APPROVED+LOCKED yapar ve ülke başına kalıcı resmi şarkı mesajını editler. Resmi mesaj güncellenemezse database değişikliği geri alınır. Ret modal sebebiyle mevcut entry değişmeden kalır; iki sonuç da kullanıcıya DM ve log üretir.

## Uçtan uca test

1. `.env` değerlerini doldurun, botu başlatın ve `/ayar` ile kanal ayarlarını ve admin rolünü kaydedin.
2. `/ülkeayarla` çalıştırın; 50 rolü ve ikinci çalıştırmada duplicate oluşmadığını doğrulayın.
3. Ülke listesi kanalında iki embed'li listenin, başvuru kanalında iki dropdown'lı kalıcı panelin oluştuğunu kontrol edin.
4. Normal kullanıcıyla örneğin Danimarka'ya başvurun. Aynı kullanıcının ve aynı ülkenin ikinci pending başvurusunun reddedildiğini doğrulayın.
5. Admin kanalında **Onayla** seçin. Kullanıcının `🇩🇰 Danimarka` rolünü aldığını, listenin/panelin güncellendiğini ve DM gönderildiğini kontrol edin.
6. Aynı kullanıcıyla şarkı gönderim kanalına uygun bir YouTube linki gönderin; ülkenin otomatik olarak Danimarka geldiğini doğrulayın.
7. Başka bir kullanıcı/ülke başvurusu oluşturup **Reddet** modalını ve ret DM'ini test edin.
8. Pending başvuruyla botu yeniden başlatın ve eski admin butonlarının çalıştığını doğrulayın.
9. Ülke listesi veya başvuru paneli mesajını silip botu yeniden başlatın; mesajın yeniden oluşturulduğunu doğrulayın.
10. Kullanılmayan bir ülke rolünü silin. O ülke onayının pending kaldığını, adminin hata aldığını; ardından `/ülkeayarla` ile rolün onarıldığını test edin.
11. İki adminin aynı başvuruyu ve iki farklı kullanıcının aynı ülkeyi eşzamanlı onaylama senaryolarını deneyin.
12. Yönetim kanalına metin ve dosya içeren bir mesaj yazıp `/duyuru kanal:#duyurular embed:false` çalıştırın.
13. Aynı kaynakla `embed:true` deneyin; ilk görseli, diğer dosyaları ve log kanalındaki kaydı kontrol edin.
14. `@everyone`, kullanıcı, rol ve kanal mention'ları içeren kaynak mesajla yalnızca kullanıcı mention'ının ping üretebildiğini doğrulayın.
15. Hedef kanaldan sırasıyla `Embed Links` ve `Attach Files` izinlerini kaldırarak açıklayıcı ephemeral hataları test edin.
16. En az iki geçerli MP3'ü `music/` klasörüne ekleyin; `/ayar` ile Sahne Kanalını seçin.
17. `/sahnebasla` ile botun konuşmacı olduğunu ve parçaların otomatik ilerlediğini doğrulayın.
18. `/sahnedur` ve `/sahnedevam` ile aynı parçanın kaldığı yerden sürdüğünü; `/sahnebit` ile botun kanaldan ayrıldığını doğrulayın.
19. Bozuk bir `.mp3` ekleyip dosyanın loglanarak atlandığını ve sonraki geçerli parçanın çaldığını doğrulayın.
20. `/ayar` ile Yarışma Durum Kanalını seçin; ülke ve şarkı onaylarında aynı mesajın editlendiğini doğrulayın.
21. Yarışma Takviminde yakın test deadline'ları girin; status embedindeki Discord timestamp'lerini kontrol edin.
22. `/hatirlat sarki` ile eksik şarkısı olan temsilcilere DM ve admin özetini test edin.
23. En az 11 ülkeye resmi şarkı atayıp `/oylama ac` çalıştırın. Bir temsilciyle `/oyla` akışında self-vote ve duplicate ülke korumasını test edin.
24. 10 puanı tamamlayıp gönderin; `/oykontrol` ile yalnızca completion, kullanıcı parametresiyle audit loglu gizli detay görüldüğünü doğrulayın.
25. Oyu düzenleyip tekrar submit edin; restart sonrasında pusulanın kaldığını kontrol edin.
26. `/oysifirla` onay/vazgeç butonlarını ve status panel güncellemesini test edin.
27. Onaylı şarkıda kilit mesajını, `/sarkikilidi ... durum:acik` sonrası yeni submission'ı ve replacement onayını test edin.
28. Botu 24 saat penceresinden sonra yeniden başlatıp aynı deadline reminder'ının tekrar gönderilmediğini doğrulayın.
29. Oylamayı kapatıp `/sonuc hazirla`; sonra bir ballot'u değiştirerek snapshot'ın etkilenmediğini doğrulayın.
30. `/sonucbaslat` ve art arda `/sonraki` çalıştırın; scoreboard'un yalnızca açıklanmış puanlarla yükseldiğini kontrol edin.
31. İki adminle aynı anda `/sonraki` çalıştırıp aynı voting country'nin iki kez açıklanmadığını doğrulayın.
32. Result RUNNING ve PAUSED durumlarında botu yeniden başlatıp index ve scoreboard recovery'yi kontrol edin.
33. Son ballot sonrasında winner embed'i, resmi şarkı bilgisini ve isteğe bağlı Kazanan Rolünü doğrulayın.
34. `Loreen - Euphoria.mp3` ile Şimdi Çalıyor, pause/resume/stop mesajlarını test edin.
35. Ülke başvurularını kapatıp panel dropdown'larının kaybolduğunu, tekrar açınca döndüğünü doğrulayın.
36. Temsilci kaldırma/değiştirmede rol, assignment, ülke listesi ve başvuru panelini kontrol edin.
37. Kilitli şarkıyla `/sarkidegistir`; onay, ret, duplicate pending ve voting-open engelini test edin.

Otomatik kontroller:

```powershell
npm run build
npm test
npm audit
```

## Database tabloları

- `country_applications`: PENDING/APPROVED/REJECTED ülke başvuruları ve admin mesaj referansları
- `country_assignments`: gerçek yarışma assignment'ları; aktif kullanıcı ve ülke için ayrı unique index'ler
- `song_submissions`: şarkı başvuruları ve başvuru/onay anı YouTube snapshot'ları
- `vote_ballots`: kullanıcı/ülke bazlı DRAFT veya SUBMITTED pusula, güvenli draft ve audit zamanları
- `vote_entries`: ballot başına unique ülke ve unique puan constraint'li gizli oy satırları
- `deadline_reminders`: deadline + reminder penceresi başına tek-sefer işleme kaydı
- `result_sessions`: persistent PREPARED/RUNNING/PAUSED/FINISHED sonuç oturumu ve reveal index
- `result_snapshot_ballots`, `result_snapshot_targets`: immutable oy ve yarışmacı snapshot'ı
- `song_change_requests`: PENDING/APPROVED/REJECTED değişiklik talebi ve önerilen YouTube snapshot'ı
- `official_entry_messages`: ülke başına düzenlenen tek resmi şarkı mesajı referansı

Eski kurulumdan `participants` tablosu kalmışsa veri kaybı olmaması için silinmez, ancak artık şarkı yetkilendirmesinde kullanılmaz.

## Kod yapısı

- `src/config/countries.ts`: sabit 50 ülke havuzu
- `src/database`: migration ve ülke/şarkı repository'leri
- `src/services/countryRoleService.ts`: rol oluşturma, bulma, verme ve geri alma
- `src/services/countryPanelService.ts`: kalıcı ülke listesi ve başvuru paneli sync işlemleri
- `src/services/announcementService.ts`: kaynak mesaj seçimi, metin bölme, mention ve attachment aktarımı
- `src/services/stageMusicService.ts`: Stage bağlantısı, FFmpeg, oynatıcı ve karışık playlist durumu
- `src/services/contestStatusService.ts`: kalıcı yarışma durum embed'i ve merkezi sync
- `src/services/votingService.ts`: voting state/deadline ve tam server-side ballot doğrulaması
- `src/services/reminderService.ts`: otomatik ve manuel hedefli DM reminder'ları
- `src/services/resultService.ts`: frozen snapshot, reveal, scoreboard, winner ve recovery
- `src/services/nowPlayingService.ts`: Stage için kalıcı now-playing mesajı
- `src/events/interactionCreate`: `/ayar`, `/ülkeayarla`, `/duyuru`, Stage, voting, admin kontrol, ülke ve şarkı etkileşimleri
- `src/validators`: şarkı kriterleri
- `src/embeds`: admin ve duyuru embed'leri
