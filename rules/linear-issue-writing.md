# Linear — Issue Açma ve Yazma

Issue tracker'da (Linear/Jira/GitHub Issues) iş kaydı açarken bu kurallar geçerli.
Commit/PR/branch kuralları için: `commit-pr-linear-conventions.md`.
Paydaşa ilerleme yazısı için: `linear-update-writing.md`.

## Kim açar

**Issue'yu geliştirici açar**, yönetici değil. Yönetici projeyi/task'ı tanımlar;
bunun tek issue mu yoksa birkaç parçaya mı bölüneceğini yalnızca işi yapan bilir.

**Bir proje = birden çok issue.** İş parça parça teslim ediliyorsa projeyi birkaç
issue'ya bölmek herkesin ilerlemeyi takip etmesini kolaylaştırır. Ama bölme
**gerçek** olmalı — teslim edilebilir, bağımsız kapanabilir parçalar; metrik için
yapay bölme yok.

## Açarken hiçbir alan boş bırakılmaz

Oluşturma anında **hepsi** doldurulur:

| Alan | Kural |
|---|---|
| **Assignee** | Varsayılan: kendin |
| **Project** | İlgili proje |
| **Priority** | Etkiye göre, gerçekçi |
| **Label** | En az bir tane |
| **Target date** | **Başlamadan önce girilir** — sonradan girilen tarih "zamanında teslim" sayılmaz |

Sahipsiz / önceliksiz / etiketsiz issue kaybolur.

Durum akışı: başlarken **In Progress**, teslim + test tamamlanınca hemen **Done/Completed**.
Aradaki durumları atlama.

## Gövde — insan gibi yaz

Ölçüt: **iç planımızı bilmeyen biri okuyup harekete geçebilmeli.**

**Yapı — Why → What to do → Done when:**

- **Why:** ne bozuk/eksik, ürün veya kullanıcı tarafından. 1-2 somut cümle.
- **What to do:** somut adımlar. Dosya yolu serbest (issue'yu geliştirici okuyor),
  ama derin iç jargonu (reducer, memoization, hook adı) asgaride tut.
- **Done when:** gözlemlenebilir sonuç + build/test yeşil.

**Bloke ise** düz bir satır: `Waiting on: <kim> — <ne>`. "Gated", "Lane" gibi
etiket kullanma.

**Dil: İngilizce.** Başlık kısa ve ne yaptığını söyler.

## Yasak dil

- **Plan / faz / lane / sprint dili yok.** "Lane A", "Phase 2", "Friday sprint",
  "plana göre" yazma; planlama dokümanına işaret etme. Issue kendi başına ayakta durmalı.
- Ham commit listesi, iç adım logu.
- Kuru görev dökümü — bir takım arkadaşına anlatır gibi yaz.

## Branch ve otomatik kapanış

Issue oluşunca Linear bir **branch adı** üretir. Aynı adla branch aç ve oraya push et;
main'e merge edildiğinde issue otomatik **Done** olur, elle taşımaya gerek kalmaz.
Bu yüzden branch adını issue'dan kopyala, kendin uydurma.

## Örnek

> **Why:** the "Edit" button on profile cards 404s for everyone, an unexpected error
> white-screens the whole app, and `/checkout` can be picked up by search engines.
>
> **What to do:** remove the Edit button; show a "something went wrong, reload" screen
> on errors; mark `/checkout` noindex.
>
> **Done when:** Edit no longer 404s, a crash shows the recovery screen, `/checkout`
> is noindex, build + tests pass.

## MCP ile açarken

Linear MCP bağlıysa issue `mcp__linear__save_issue` ile açılabilir. Aynı kurallar
geçerli — özellikle **hiçbir alan boş bırakılmaz**: `assigneeId`, `projectId`,
`priority`, `labelIds`, `dueDate`. MCP üzerinden açmak alan doldurma zorunluluğunu
kaldırmaz, kolaylaştırır.

Issue açmak **dışa dokunan** bir eylemdir: `safety-and-quality.md` gereği her
seferinde kullanıcı onayı alınır.

## Proje kendi SOP'unu getiriyorsa

Repo içinde issue-yazım SOP'u varsa **o kazanır**. Bu dosya varsayılan.
