/**
 * Telegram Bot Integration for SmartBilling
 * Supports manual payment notifications and instant approval/cancellation via inline buttons.
 */

export interface TelegramConfig {
  botToken: string;
  allowedChatIds: string[];
  enabled: boolean;
}

export interface TelegramNotificationParams {
  orderId: string;
  orderType: 'voucher' | 'invoice';
  paymentCode?: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  itemName: string;
  validity?: string;
  methodName?: string;
  accountNumber?: string;
  accountHolder?: string;
  instructions?: string;
  createdAt?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    text?: string;
  };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    text?: string;
  };
  callback_query?: TelegramCallbackQuery;
}

export type ActionHandler = (
  orderId: string,
  orderType: 'voucher' | 'invoice',
  action: 'approve' | 'reject',
  adminInfo: string
) => Promise<{ success: boolean; message?: string }>;

export function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class TelegramBotManager {
  private config: TelegramConfig = {
    botToken: '',
    allowedChatIds: [],
    enabled: false,
  };
  private actionHandler: ActionHandler | null = null;
  private abortController: AbortController | null = null;
  private isPolling = false;
  private offset = 0;

  public setActionHandler(handler: ActionHandler) {
    this.actionHandler = handler;
  }

  public updateConfig(config: Partial<TelegramConfig>) {
    if (config.botToken !== undefined && config.botToken !== this.config.botToken) {
      this.offset = 0;
    }
    this.config = {
      ...this.config,
      ...config,
      allowedChatIds: (config.allowedChatIds || this.config.allowedChatIds).map(id => id.trim()).filter(Boolean),
    };
  }

  public getConfig(): TelegramConfig {
    return { ...this.config };
  }

  private isChatAllowed(chatId: string | number): boolean {
    const idStr = String(chatId).trim();
    if (!this.config.allowedChatIds.length) return false;
    return this.config.allowedChatIds.some(allowed => allowed === idStr || allowed === `-${idStr}`);
  }

  public async callApi(method: string, payload?: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    const token = this.config.botToken;
    if (!token) throw new Error('Telegram bot token belum dikonfigurasi');

    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      const desc = data.description || `HTTP ${response.status}`;
      throw new Error(`Telegram API [${method}] gagal: ${desc}`);
    }
    return data.result;
  }

  public async testConnection(token?: string, chatId?: string): Promise<{ success: boolean; botName: string; username: string; message: string }> {
    const activeToken = token || this.config.botToken;
    if (!activeToken) throw new Error('Token bot Telegram tidak boleh kosong');

    const tempUrl = `https://api.telegram.org/bot${activeToken}/getMe`;
    const res = await fetch(tempUrl);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(`Koneksi bot gagal: ${data.description || 'Token tidak valid'}`);
    }

    const botName = data.result.first_name || 'Bot';
    const username = data.result.username || '';

    // If chatId is provided, send a verification message
    const targetChatIds = (chatId || this.config.allowedChatIds.join(','))
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    if (targetChatIds.length) {
      const testMsg =
        `✅ <b>Uji Koneksi Telegram Berhasil!</b>\n\n` +
        `Bot <b>@${escapeHtml(username)}</b> terhubung dengan SmartBilling.\n` +
        `Notifikasi pesanan manual dan tombol persetujuan siap digunakan.\n\n` +
        `🕒 <i>${new Date().toLocaleString('id-ID')}</i>`;

      const failures: string[] = [];
      for (const targetChatId of targetChatIds) {
        const sendUrl = `https://api.telegram.org/bot${activeToken}/sendMessage`;
        try {
          const sendRes = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              text: testMsg,
              parse_mode: 'HTML',
            }),
          });
          const sendData = await sendRes.json();
          if (!sendRes.ok || !sendData.ok) {
            failures.push(`${targetChatId}: ${sendData.description || `HTTP ${sendRes.status}`}`);
          }
        } catch (error) {
          failures.push(`${targetChatId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (failures.length) {
        throw new Error(`Token valid, tetapi pesan uji gagal dikirim: ${failures.join('; ')}. Pastikan setiap penerima sudah membuka bot dan klik /start.`);
      }
    }

    return {
      success: true,
      botName,
      username,
      message: targetChatIds.length
        ? `Koneksi berhasil dan pesan uji telah dikirim ke ${targetChatIds.length} chat.`
        : 'Token valid! Bot ditemukan.',
    };
  }

  public async notifyManualPayment(params: TelegramNotificationParams): Promise<{ sentCount: number; errors: string[] }> {
    if (!this.config.enabled || !this.config.botToken || !this.config.allowedChatIds.length) {
      return { sentCount: 0, errors: ['Telegram bot tidak aktif atau chat ID belum diisi'] };
    }

    const orderTitle = params.orderType === 'voucher' ? 'PEMESANAN VOUCHER HOTSPOT' : 'PEMBAYARAN TAGIHAN PPPoE';
    const emoji = params.orderType === 'voucher' ? '🎟️' : '📄';
    const amountStr = `Rp ${params.amount.toLocaleString('id-ID')}`;
    const timeStr = params.createdAt
      ? new Date(params.createdAt).toLocaleString('id-ID')
      : new Date().toLocaleString('id-ID');

    let text =
      `${emoji} <b>NOTIFIKASI PEMBAYARAN MANUAL</b>\n` +
      `<b>${orderTitle}</b>\n\n` +
      `📋 <b>Kode Bayar:</b> <code>${escapeHtml(params.paymentCode || params.orderId)}</code>\n` +
      `📦 <b>Paket / Layanan:</b> ${escapeHtml(params.itemName)}${params.validity ? ` (${escapeHtml(params.validity)})` : ''}\n` +
      `💰 <b>Total Tagihan:</b> <b>${amountStr}</b>\n` +
      `👤 <b>Nama Pelanggan:</b> ${escapeHtml(params.customerName)}\n` +
      `📱 <b>WhatsApp:</b> <code>${escapeHtml(params.customerPhone)}</code>\n` +
      `🏦 <b>Metode:</b> ${escapeHtml(params.methodName || 'Transfer Manual')}\n` +
      (params.accountNumber ? `💳 <b>Rekening Tujuan:</b> ${escapeHtml(params.accountNumber)} (a.n ${escapeHtml(params.accountHolder || '-')})\n` : '') +
      `🕒 <b>Waktu Pemesanan:</b> ${timeStr}\n\n` +
      `<i>💡 Pastikan bukti transfer pada WhatsApp operator telah valid sebelum menyetujui.</i>`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ SETUJUI', callback_data: `appr:${params.orderType}:${params.orderId}` },
          { text: '❌ BATALKAN', callback_data: `canc:${params.orderType}:${params.orderId}` },
        ],
      ],
    };

    let sentCount = 0;
    const errors: string[] = [];

    for (const chatId of this.config.allowedChatIds) {
      try {
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard,
        });
        sentCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Chat ${chatId}: ${errorMsg}`);
        console.error(`[Telegram] Gagal mengirim pesan ke ${chatId}:`, errorMsg);
      }
    }

    return { sentCount, errors };
  }

  public startPolling() {
    if (this.isPolling) return;
    if (!this.config.enabled || !this.config.botToken) {
      return;
    }

    this.isPolling = true;
    this.abortController = new AbortController();
    console.log('🤖 [Telegram] Bot polling dimulai...');

    void this.pollingLoop(this.abortController.signal);
  }

  public stopPolling() {
    if (!this.isPolling) return;
    console.log('🤖 [Telegram] Bot polling dihentikan.');
    this.isPolling = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public restartPolling(newConfig?: Partial<TelegramConfig>) {
    this.stopPolling();
    if (newConfig) {
      this.updateConfig(newConfig);
    }
    if (this.config.enabled && this.config.botToken) {
      // Delay slightly before restarting to avoid duplicate connections
      setTimeout(() => {
        this.startPolling();
      }, 1000);
    }
  }

  private async pollingLoop(signal: AbortSignal) {
    while (this.isPolling && !signal.aborted) {
      try {
        const updates: TelegramUpdate[] = await this.callApi(
          'getUpdates',
          {
            offset: this.offset,
            timeout: 25,
            allowed_updates: ['message', 'callback_query'],
          },
          signal
        );

        for (const update of updates) {
          if (update.update_id >= this.offset) {
            this.offset = update.update_id + 1;
          }
          await this.handleUpdate(update);
        }
      } catch (err: any) {
        if (signal.aborted || !this.isPolling) break;

        // If unauthorized token, stop polling
        if (err instanceof Error && /(?:\b401\b|unauthorized)/i.test(err.message)) {
          console.error('❌ [Telegram] Bot token tidak valid (401). Polling dinonaktifkan.');
          this.isPolling = false;
          break;
        }

        console.error('[Telegram] Polling gagal; mencoba kembali dalam 5 detik:', err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate) {
    if (update.message) {
      await this.handleMessage(update.message);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    }
  }

  private async handleMessage(msg: NonNullable<TelegramUpdate['message']>) {
    const text = (msg.text || '').trim();
    const chatId = msg.chat.id;
    const fromId = msg.from?.id || chatId;
    const isAllowed = this.isChatAllowed(chatId) || this.isChatAllowed(fromId);

    if (text.startsWith('/myid') || text.startsWith('/id')) {
      const response =
        `🆔 <b>ID Telegram Anda:</b> <code>${fromId}</code>\n` +
        `💬 <b>ID Chat:</b> <code>${chatId}</code>\n` +
        `👤 <b>Nama:</b> ${escapeHtml(msg.from?.first_name || '')} ${escapeHtml(msg.from?.last_name || '')}\n` +
        `🏷️ <b>Username:</b> ${msg.from?.username ? `@${escapeHtml(msg.from.username)}` : '<i>(tidak ada)</i>'}\n\n` +
        (isAllowed
          ? `✅ <b>Akun Anda TERDAFTAR</b> sebagai admin SmartBilling. Anda dapat menerima notifikasi dan melakukan verifikasi pembayaran.`
          : `⚠️ <b>Akun Anda BELUM TERDAFTAR.</b>\nSalin ID di atas dan masukkan ke menu <b>Pengaturan &gt; Bot Telegram &gt; ID Chat/Pengguna Telegram</b> di dashboard admin SmartBilling.`);

      try {
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text: response,
          parse_mode: 'HTML',
        });
      } catch (err) {
        console.error('[Telegram] Gagal membalas /myid:', err);
      }
      return;
    }

    if (text.startsWith('/start') || text.startsWith('/help')) {
      const response =
        `👋 <b>Halo! Ini adalah Bot Notifikasi SmartBilling.</b>\n\n` +
        `Bot ini digunakan untuk:\n` +
        `• Menerima notifikasi otomatis saat pelanggan melakukan pembelian voucher/pembayaran manual.\n` +
        `• Menyetujui (SETUJUI) atau membatalkan (BATALKAN) pembayaran secara langsung dari Telegram.\n\n` +
        `🆔 <b>ID Telegram Anda:</b> <code>${fromId}</code>\n\n` +
        (isAllowed
          ? `✅ Status: <b>Aktif & Terdaftar</b>`
          : `⚠️ Masukkan ID Anda ke menu <b>Pengaturan SmartBilling</b> agar bot dapat mengirimkan pesan ke akun ini.`);

      try {
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text: response,
          parse_mode: 'HTML',
        });
      } catch (err) {
        console.error('[Telegram] Gagal membalas /start:', err);
      }
      return;
    }
  }

  private async handleCallbackQuery(cb: TelegramCallbackQuery) {
    const callbackId = cb.id;
    const data = cb.data || '';
    const fromId = cb.from.id;
    const chatId = cb.message?.chat.id || fromId;
    const messageId = cb.message?.message_id;

    // Check authorization
    const isAllowed = this.isChatAllowed(fromId) || this.isChatAllowed(chatId);
    if (!isAllowed) {
      try {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: `⛔ Akses ditolak! ID Telegram Anda (${fromId}) belum didaftarkan di Pengaturan SmartBilling.`,
          show_alert: true,
        });
      } catch (err) {
        console.error('[Telegram] Gagal menolak callback query:', err);
      }
      return;
    }

    // Parse action: appr:orderType:orderId or canc:orderType:orderId
    const parts = data.split(':');
    if (parts.length < 3) {
      try {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Format perintah tidak valid',
          show_alert: false,
        });
      } catch {}
      return;
    }

    const [cmd, orderType, ...orderIdParts] = parts;
    const orderId = orderIdParts.join(':');
    const action = cmd === 'appr' ? 'approve' : cmd === 'canc' ? 'reject' : null;

    if (!action || (orderType !== 'voucher' && orderType !== 'invoice')) {
      try {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Aksi tidak dikenal',
          show_alert: false,
        });
      } catch {}
      return;
    }

    const adminName = cb.from.username
      ? `@${cb.from.username}`
      : `${cb.from.first_name} ${cb.from.last_name || ''}`.trim();
    const adminInfo = `${adminName} (ID: ${fromId})`;

    if (!this.actionHandler) {
      try {
        await this.callApi('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Sistem billing belum siap memproses aksi ini.',
          show_alert: true,
        });
      } catch {}
      return;
    }

    try {
      await this.callApi('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'Permintaan diterima, sedang diproses.',
        show_alert: false,
      });
    } catch (err) {
      console.error('[Telegram] Gagal mengakui callback query:', err);
    }

    try {
      const result = await this.actionHandler(orderId, orderType, action, adminInfo);

      if (!result.success) {
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text: `Gagal memproses ${orderType} ${orderId}: ${result.message || 'Terjadi kesalahan sistem'}`,
        });
        return;
      }

      // Update the original message text and remove inline buttons
      if (messageId && cb.message?.text) {
        const originalText = cb.message.text;
        const statusBadge = action === 'approve'
          ? `\n\n━━━━━━━━━━━━━━━━━━━━━━\n✅ <b>STATUS: SUDAH DISETUJUI</b>\n👤 <b>Oleh:</b> ${escapeHtml(adminInfo)}\n🕒 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}`
          : `\n\n━━━━━━━━━━━━━━━━━━━━━━\n❌ <b>STATUS: DIBATALKAN</b>\n👤 <b>Oleh:</b> ${escapeHtml(adminInfo)}\n🕒 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}`;

        const updatedHtml = escapeHtml(originalText)
          .replace(/&lt;b&gt;/g, '<b>')
          .replace(/&lt;\/b&gt;/g, '</b>')
          .replace(/&lt;code&gt;/g, '<code>')
          .replace(/&lt;\/code&gt;/g, '</code>')
          .replace(/&lt;i&gt;/g, '<i>')
          .replace(/&lt;\/i&gt;/g, '</i>') + statusBadge;

        try {
          await this.callApi('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: updatedHtml,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] },
          });
        } catch (editErr) {
          console.error('[Telegram] Gagal edit message text:', editErr);
        }
      }
    } catch (err) {
      console.error('[Telegram] Error saat memproses aksi:', err);
      try {
        await this.callApi('sendMessage', {
          chat_id: chatId,
          text: `Gagal memproses ${orderType} ${orderId}: ${err instanceof Error ? err.message : 'Kesalahan internal'}`,
        });
      } catch (notifyErr) {
        console.error('[Telegram] Gagal mengirim pemberitahuan kegagalan aksi:', notifyErr);
      }
    }
  }
}

export const telegramBot = new TelegramBotManager();
