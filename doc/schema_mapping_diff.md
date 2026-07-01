# Analisis Perbedaan Skema (Schema Mapping & Diff) - TERUPDATE

Dokumen ini merinci hasil perbandingan mendalam antara model data **Firestore** (diambil dari berkas tipe data `.types.ts` di frontend) dengan skema **PostgreSQL** di [database_schema.sql](file:///d:/RYAN-OPR/DEVELOP/financial-planner/docs/database_schema.sql) setelah penyesuaian review disetujui.

---

## 1. Konversi Tipe Data Dasar

| Tipe Data Firestore (NoSQL) | Tipe Data PostgreSQL (SQL) | Langkah Transformasi / Migrasi |
| :--- | :--- | :--- |
| **ID Dokumen (Base62 - 20 karakter)** | **`UUID` (36 karakter)** | Harus dikonversi secara deterministik menggunakan **UUID v5** dengan namespace khusus (misal: `uuidv5(firestoreId, NAMESPACE)`). |
| **`Timestamp` (Firebase Object)** | **`TIMESTAMP WITH TIME ZONE`** | Konversi properti detik dan nanodetik Firestore menjadi format ISO 8601 String (`toISOString()`) sebelum di-*insert*. |
| **`number` (Double/Float)** | **`NUMERIC(15, 2)`** | Cocok untuk nominal keuangan. Untuk persentase, gunakan `NUMERIC(5, 2)`. |
| **`string[]` (Array of Strings)** | **`VARCHAR[]` atau `TEXT[]`** | Masuk sebagai array PostgreSQL (contoh format: `'{tag1,tag2}'`). |
| **Nested Object / Map** | **`JSONB`** | Disimpan langsung sebagai dokumen JSON terstruktur. |

---

## 2. Resolusi Pemetaan Tabel & Kolom

Berikut adalah status final dari kolerasi field Firestore dan kolom PostgreSQL:

### A. Tabel `users`
* **Status:** **Selesai (Perfect)**. Onboarding telah digabung langsung ke tabel `users`.
* **Kolom Onboarding:**
  * `is_onboarding_complete` (BOOLEAN)
  * `onboarding_completed_at` (TIMESTAMPTZ)
  * `setup_progress` (JSONB)

### B. Tabel `wallets`, `categories`, & `subcategories`
* **Status:** **Selesai**. 
* **Keputusan:** Kolom `display_order` **tidak diperlukan** di tingkat SQL. Proses pengurutan daftar di UI frontend akan ditangani menggunakan pengurutan default SQL (`ORDER BY name ASC` atau sejenisnya) atau diatur di level API Express.

### C. Tabel `transactions`
* **Status:** **Selesai**.
* **Keputusan:** Kolom `status` dan `attachments` **tidak diperlukan** karena tidak digunakan oleh fitur utama aplikasi saat ini. Properti waktu (`year`, `month`, `day`, `yearMonth`) diekstrak secara dinamis oleh backend Express dari kolom `date` (tidak disimpan sebagai kolom terpisah di database).

### D. Tabel `debt_loans` (Hutang & Piutang)
* **Status:** **Selesai (Updated)**.
* **Kolom yang Ditambahkan ke SQL:**
  * `principal_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00` (untuk nominal pokok hutang awal).
  * `source_category_id UUID REFERENCES categories(id) ON DELETE SET NULL` (untuk kategori asal dana).
* **Keputusan:** Kolom `payment_schedule` dan detail tenor cicilan (`installment_count`, `installment_paid`, `installment_amount`) **tidak diperlukan** karena status pembayaran dinamis dapat dihitung secara agregat melalui histori mutasi di tabel `debt_loan_mutations`.

### E. Tabel `goals` (Target Tabungan)
* **Status:** **Selesai**.
* **Keputusan:** Kolom `milestones` **tidak diperlukan** karena kemajuan milestone notifikasi (25%, 50%, 75%, 100%) dapat dihitung secara dinamis di level API backend/frontend menggunakan rasio `current_amount / target_amount`.

---

## 3. Catatan Penting untuk Backend & Frontend Refactoring
Karena struktur PostgreSQL sekarang lebih ramping (beberapa data dihitung dinamis/agregat):
1. **API Express harus menyediakan virtual fields** untuk respons JSON ke frontend (misal: `remainingAmount`, `percentageComplete` pada Goals, dan `remainingPrincipal`, `isOverdue` pada Debts) agar kode frontend React tidak rusak.
2. **Konversi Format Tanggal:** Backend Express harus memastikan semua data tanggal PostgreSQL (`TIMESTAMPTZ`) dikirim sebagai ISO String, dan frontend React harus memparsing string tersebut menjadi objek `Date` JavaScript (menggantikan pemanggilan fungsi `.toDate()` bawaan Firebase SDK).
