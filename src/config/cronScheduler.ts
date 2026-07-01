import { supabase } from './supabase';

/**
 * Menghitung tanggal kejadian berikutnya berdasarkan frekuensi
 */
const calculateNextOccurrence = (currentDate: Date, frequency: string): Date => {
  const next = new Date(currentDate);
  switch (frequency) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'biweekly':
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'yearly':
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    default:
      next.setUTCDate(next.getUTCDate() + 30); // fallback bulanan jika tipe tidak dikenali
  }
  return next;
};

/**
 * Memindai dan memproses transaksi berulang
 */
export const processRecurringTransactions = async (): Promise<void> => {
  console.log('[cron]: Memulai pemeriksaan transaksi berulang...');
  try {
    const nowISO = new Date().toISOString();

    // 1. Ambil transaksi berulang yang aktif dan waktunya sudah tiba (atau lewat)
    const { data: recurringList, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .lte('next_occurrence', nowISO);

    if (error) {
      console.error('[cron]: Gagal mengambil data recurring_transactions:', error.message);
      return;
    }

    if (!recurringList || recurringList.length === 0) {
      console.log('[cron]: Tidak ada transaksi berulang yang jatuh tempo saat ini.');
      return;
    }

    console.log(`[cron]: Menemukan ${recurringList.length} transaksi berulang yang jatuh tempo.`);

    for (const rec of recurringList) {
      // 2. Insert record transaksi baru ke tabel transactions
      const txDate = rec.next_occurrence;
      const { data: newTx, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: rec.user_id,
          amount: rec.amount,
          type: rec.type,
          category_id: rec.category_id,
          subcategory_id: rec.subcategory_id,
          wallet_id: rec.wallet_id,
          date: txDate,
          note: rec.note || 'Transaksi Otomatis Berulang',
          tags: rec.tags || [],
          recurring_id: rec.id
        })
        .select()
        .single();

      if (txError) {
        console.error(`[cron]: Gagal membuat transaksi untuk recurring_id ${rec.id}:`, txError.message);
        continue; // Lanjut ke transaksi berikutnya
      }

      console.log(`[cron]: Sukses membuat transaksi ID ${newTx.id} untuk user ${rec.user_id}`);

      // 3. Kalkulasi next_occurrence baru
      const currentNext = new Date(rec.next_occurrence);
      const newNext = calculateNextOccurrence(currentNext, rec.frequency);
      
      let isActive = true;
      if (rec.end_date && newNext > new Date(rec.end_date)) {
        isActive = false;
        console.log(`[cron]: Recurring ID ${rec.id} telah mencapai end_date. Menonaktifkan schedule.`);
      }

      // 4. Update status recurring_transactions
      const { error: updateError } = await supabase
        .from('recurring_transactions')
        .update({
          next_occurrence: newNext.toISOString(),
          last_generated_date: txDate,
          total_generated: (rec.total_generated || 0) + 1,
          is_active: isActive,
          updated_at: nowISO
        })
        .eq('id', rec.id);

      if (updateError) {
        console.error(`[cron]: Gagal meng-update status recurring_transactions ID ${rec.id}:`, updateError.message);
      }
    }
  } catch (error: any) {
    console.error('[cron]: Terjadi kesalahan saat memproses transaksi berulang:', error.message);
  }
};

/**
 * Memulai scheduler cron job
 */
export const startRecurringScheduler = async (): Promise<void> => {
  try {
    const cron = await import('node-cron');
    const scheduler = cron.default || cron;
    // Jadwalkan pemindaian setiap hari pukul 00:01 server
    scheduler.schedule('1 0 * * *', async () => {
      await processRecurringTransactions();
    });
    console.log('[cron]: Scheduler Transaksi Berulang diaktifkan (berjalan pukul 00:01 harian).');
  } catch (err: any) {
    console.error('[cron]: Gagal mengimpor node-cron:', err.message);
  }
};
