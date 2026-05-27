const PAGBANK_TOKEN   = process.env.PAGBANK_TOKEN;
const PAGBANK_API     = 'https://api.pagseguro.com';
const API_BASE_URL    = process.env.API_BASE_URL || 'http://localhost:3000';

// ── helpers ────────────────────────────────────────────────────────────────

function cleanCpf(cpf) {
    return (cpf || '').replace(/\D/g, '');
}

function parsePhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    const area   = digits.substring(0, 2);
    const number = digits.substring(2);
    return { country: '55', area, number, type: 'MOBILE' };
}

function toCents(value) {
    return Math.round(parseFloat(value) * 100);
}

async function pagbankRequest(path, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${PAGBANK_API}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
        const msg = data?.error_messages?.map(e => e.description).join('; ')
               || data?.message
               || JSON.stringify(data);
        throw new Error(`PagBank [${res.status}]: ${msg}`);
    }
    return data;
}

// ── PIX ────────────────────────────────────────────────────────────────────

async function createPixPayment({ customer, items, total, protocol }) {
    // PIX expira em 30 minutos
    const expiration = new Date(Date.now() + 30 * 60 * 1000);
    // PagBank exige offset de fuso, e.g. -03:00
    const expirationStr = expiration.toISOString().replace(/\.\d+Z$/, '-03:00');

    const totalCents = toCents(total);

    const payload = {
        reference_id: protocol,
        customer: {
            name: customer.name,
            email: customer.email,
            tax_id: cleanCpf(customer.cpf),
            phones: [parsePhone(customer.phone)],
        },
        items: items.map((item, i) => ({
            reference_id: `item_${i}`,
            name: (item.name || 'Exame').substring(0, 64),
            quantity: 1,
            unit_amount: toCents(item.price),
        })),
        qr_codes: [{
            amount: { value: totalCents },
            expiration_date: expirationStr,
        }],
        notification_urls: [`${API_BASE_URL}/api/pagbank/webhook`],
    };

    const data = await pagbankRequest('/orders', 'POST', payload);
    const qr   = data.qr_codes?.[0];

    return {
        paymentId:     data.id,
        pixCode:       qr?.text,
        pixExpiration: qr?.expiration_date,
        pixStatus:     qr?.status,
    };
}

// ── Cartão de Crédito ───────────────────────────────────────────────────────

async function createCardPayment({ customer, items, total, protocol, encryptedCard, installments = 1 }) {
    const totalCents = toCents(total);

    const payload = {
        reference_id: protocol,
        customer: {
            name: customer.name,
            email: customer.email,
            tax_id: cleanCpf(customer.cpf),
            phones: [parsePhone(customer.phone)],
        },
        items: items.map((item, i) => ({
            reference_id: `item_${i}`,
            name: (item.name || 'Exame').substring(0, 64),
            quantity: 1,
            unit_amount: toCents(item.price),
        })),
        charges: [{
            reference_id:  `charge_${protocol}`,
            description:   'Exames - Tottal Análise',
            amount: {
                value:    totalCents,
                currency: 'BRL',
            },
            payment_method: {
                type:         'CREDIT_CARD',
                installments,
                capture:      true,
                card: {
                    encrypted: encryptedCard,
                    holder: {
                        name:   customer.name,
                        tax_id: cleanCpf(customer.cpf),
                    },
                    store: false,
                },
            },
        }],
        notification_urls: [`${API_BASE_URL}/api/pagbank/webhook`],
    };

    const data   = await pagbankRequest('/orders', 'POST', payload);
    const charge = data.charges?.[0];

    return {
        paymentId:     data.id,
        chargeId:      charge?.id,
        paymentStatus: charge?.status,           // PAID, DECLINED, etc.
        authCode:      charge?.payment_response?.code,
        authMessage:   charge?.payment_response?.message,
    };
}

// ── Chave pública para criptografia do cartão ───────────────────────────────

async function getPublicKey() {
    return await pagbankRequest('/public-keys/card', 'GET');
}

module.exports = { createPixPayment, createCardPayment, getPublicKey };
