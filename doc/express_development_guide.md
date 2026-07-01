# 📘 Panduan Pengembangan Express Backend (Referensi Developer)

Dokumen ini disusun sebagai panduan teknis bagi developer saat membangun **Express Backend** untuk Financial Planner. Dokumen ini merangkum seluruh aturan data, pembagian logika (*separation of concerns*), dan detail teknis hasil migrasi dari Firebase Firestore ke Supabase PostgreSQL.

---

## 🗺️ Peta Berkas Migrasi: Mana yang Perlu Digunakan?

| Nama Berkas | Kategori | Deskripsi | Relevansi untuk Express Backend |
| :--- | :--- | :--- | :--- |
| [database_schema.sql](file:///d:/RYAN-OPR/DEVELOP/Financial%20Plann3r/migration/database_schema.sql) | **Utama** | Skema tabel, tipe data, indeks, dan trigger otomatis PostgreSQL. | **Sangat Tinggi**: Harus diacu sebagai struktur database Supabase yang diakses Express. |
| [feature_mapping.md](file:///d:/RYAN-OPR/DEVELOP/Financial%20Plann3r/migration/feature_mapping.md) | **Utama** | Pembagian tanggung jawab logika bisnis antara Frontend (React) dan Backend (Express). | **Sangat Tinggi**: Menjelaskan fitur-fitur apa saja yang harus dihandle oleh Express. |
| [schema_mapping_diff.md](file:///d:/RYAN-OPR/DEVELOP/Financial%20Plann3r/migration/schema_mapping_diff.md) | **Utama** | Catatan perbedaan tipe data & pemetaan field dari Firestore ke PostgreSQL. | **Sangat Tinggi**: Panduan tentang *virtual fields* dan penanganan tipe data. |
| `export_firestore.js` & `import_supabase.js` | **Migrasi** | Skrip untuk menarik data dari Firestore dan memindahkannya ke Supabase. | **Rendah**: Bisa diabaikan setelah proses pemindahan data awal selesai. |
| `README.md` & `migration_plan.md` | **Migrasi** | Instruksi langkah-langkah menjalankan skrip migrasi. | **Rendah**: Hanya digunakan sebagai acuan proses migrasi. |

---

## ⚠️ Hal-Hal Penting yang Harus Diperhatikan saat Membangun Express

Saat menulis kode backend Express, perhatikan aturan-aturan penting berikut yang didesain dari hasil migrasi:

### 1. Database Triggers (Express Jangan Menghitung Manual!)
Supabase PostgreSQL telah dilengkapi dengan beberapa trigger otomatis. Backend Express **TIDAK PERLU** melakukan operasi pembaruan manual untuk kolom/tabel berikut ketika melakukan manipulasi transaksi:
* **Saldo Dompet (`wallets.balance`)**: Otomatis bertambah/berkurang via trigger `trg_wallet_balance_adjustment` saat baris di tabel `transactions` di-insert, di-update, atau di-delete.
* **Akumulasi Pengeluaran Anggaran (`budgets.spent_amount`) & Status Anggaran**: Otomatis dihitung dan diperbarui via trigger `trg_budget_spent_adjustment` ketika transaksi bertipe `expense` masuk ke kategori terkait.
* **Progres Tabungan (`goals.current_amount`) & Status Target**: Otomatis disesuaikan via trigger `trg_goal_current_amount_adjustment` (pengeluaran ke dompet tabungan dianggap menambah tabungan, pendapatan dianggap mengurangi tabungan).
* **Status Lunas Hutang/Piutang (`debt_loans.status`)**: Otomatis berubah menjadi `completed` atau `active` via trigger `trg_debt_loan_status_adjustment` berdasarkan perhitungan mutasi masuk/keluar di tabel `debt_loan_mutations`.

> [!IMPORTANT]  
> Backend Express cukup melakukan operasi CRUD standar (`INSERT`, `UPDATE`, `DELETE`) pada tabel utama (`transactions` & `debt_loan_mutations`). Serahkan kalkulasi saldo dan status ke Database Triggers demi konsistensi data.

---

### 2. Payload API & "Virtual Fields" untuk Frontend
PostgreSQL dirancang lebih ramping (normalisasi) dibanding Firestore. Ada beberapa properti yang dulunya disimpan di Firestore namun sekarang dihapus di PostgreSQL dan harus dihitung secara dinamis oleh backend Express. 

Express API **harus menyertakan virtual fields berikut** dalam response JSON agar React Frontend tidak mengalami error (*break*):

#### A. Endpoint `/api/goals`
Sertakan bidang dinamis:
* `remainingAmount`: `target_amount - current_amount`
* `percentageComplete`: `(current_amount / target_amount) * 100`

#### B. Endpoint `/api/debts` atau `/api/debt-loans`
Hitung sisa pokok secara dinamis dari histori mutasi di tabel `debt_loan_mutations`:
* `remainingPrincipal`: Jumlahkan mutasi bertipe `increase` dan `interest`, lalu kurangi dengan mutasi bertipe `decrease`.
* `isOverdue`: `true` jika status database bukan `completed` dan `due_date < NOW()`.

#### C. Endpoint `/api/transactions`
Meskipun database hanya menyimpan kolom `date` (TIMESTAMPTZ), API Express harus dapat mengekstrak dan mengirimkan properti berikut ke frontend untuk kebutuhan pengelompokan riwayat:
* `year`, `month`, `day`, `yearMonth` (contoh: `2026-07`).

---

### 3. Penanganan Tipe Data
* **Format Tanggal**: Pastikan semua format tanggal yang dikirim ke Frontend menggunakan ISO 8601 String (PostgreSQL `TIMESTAMPTZ` secara default dikirim sebagai string format ISO oleh library `pg` / `sequelize` / `prisma`). Frontend akan memparsing string ini menggunakan `new Date(dateString)`.
* **Kolom JSONB**: Gunakan data bertipe `JSONB` di PostgreSQL secara tepat. Ketika menulis ke database (misal preferensi user atau aturan budget bulanan), pastikan data dikirim sebagai objek JSON valid (Express ORM biasanya melakukan serialisasi otomatis).

---

## ⚙️ Detail Implementasi Fitur Utama di Express

### A. Laporan Ringkasan Bulanan (Endpoint: `GET /api/summaries/:yearMonth`)
1. Backend memeriksa apakah baris ringkasan untuk `user_id` dan `year_month` tersebut sudah ada di tabel `summaries` dan kolom `is_calculated` bernilai `true`.
2. Jika ada, kembalikan data dari cache tabel tersebut.
3. Jika belum ada (atau perlu dihitung ulang karena ada transaksi baru):
   * Jalankan kueri agregasi SQL untuk menghitung total pendapatan (`income`), pengeluaran (`expense`), rata-rata belanja harian, kategori dengan pengeluaran terbesar, dll.
   * Lakukan `UPSERT` (Insert atau Update jika konflik key) ke tabel `summaries` dengan menandai `is_calculated = true`.
   * Kembalikan data agregasi tersebut ke klien.

### B. Otomatisasi Transaksi Berulang (Recurring Transactions)
* Buat sebuah task scheduler (misalnya menggunakan library `node-cron` di Node.js, atau queue runner seperti `bullmq`).
* Jalankan script pemindaian setiap hari pada pukul `00:01` server:
  1. Cari semua baris di tabel `recurring_transactions` yang aktif (`is_active = true`) dan `next_occurrence <= NOW()`.
  2. Untuk setiap baris yang cocok, lakukan transaksi database:
     * Masukkan baris transaksi baru ke tabel `transactions`.
     * Hitung tanggal kejadian berikutnya (*next occurrence*) berdasarkan kolom `frequency` (`daily`, `weekly`, `monthly`, etc.).
     * Update kolom `next_occurrence` and `last_generated_date` pada tabel `recurring_transactions`.

### C. Alokasi Pembayaran Hutang Metode FIFO (First-In, First-Out)
Saat pengguna melakukan pembayaran cicilan hutang melalui API:
1. Jalankan dalam transaksi SQL aman (`BEGIN ... COMMIT`).
2. Buat record transaksi di tabel `transactions` (untuk mencatat aliran uang di dompet).
3. Cari kontrak hutang aktif (`debt_loans` bertipe `debt`) milik user yang belum lunas.
4. Lakukan alokasi dana pembayaran ke setiap kontrak secara berurutan berdasarkan tanggal pembuatan kontrak paling lama (FIFO).
5. Buat baris mutasi baru di tabel `debt_loan_mutations` dengan tipe `decrease` untuk masing-masing kontrak yang mendapatkan alokasi dana.

---

## 🔒 Otentikasi dan Batasan Paket (Plan Limiting)
* **JWT Verification**: Seluruh endpoint Express yang membutuhkan otentikasi wajib memverifikasi JWT token yang dikirimkan oleh Supabase Auth di header `Authorization: Bearer <token>`.
* **Gatekeeper Batasan Paket**: Sebelum melakukan insert data baru (seperti membuat dompet baru di `POST /api/wallets`), verifikasi paket pengguna di `users.plan`:
  - Jika paket pengguna adalah `free` dan jumlah dompet aktifnya sudah mencapai batas (misal: 3), batalkan operasi dan kirimkan response `403 Forbidden` dengan pesan limitasi paket.
