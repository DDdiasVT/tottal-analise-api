const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const {
    getExams, createExam, updateExam, deleteExam,
    createOrder, getOrders, updateOrder, updateOrderPayment,
} = require('./services/supabaseService');
const { createPixPayment, createCardPayment, getPublicKey } = require('./services/pagbankService');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('Tottal Análise API is running'));

// ── Exams ───────────────────────────────────────────────────────────────────
app.get('/api/exams', async (_req, res) => {
    try { res.json(await getExams()); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch exams' }); }
});

app.post('/api/exams', async (req, res) => {
    try { res.status(201).json(await createExam(req.body)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create exam' }); }
});

app.put('/api/exams/:id', async (req, res) => {
    try { res.json(await updateExam(req.params.id, req.body)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update exam' }); }
});

app.delete('/api/exams/:id', async (req, res) => {
    try { await deleteExam(req.params.id); res.status(204).send(); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete exam' }); }
});

// ── Orders ──────────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
    try {
        const { paymentMethod, encryptedCard, installments, ...rest } = req.body;

        // 1. Criar pedido no banco (sem dados de pagamento ainda)
        const order = await createOrder({ ...rest, paymentMethod });
        const protocol = order.protocol;

        // 2. Processar pagamento conforme método
        if (paymentMethod === 'pix') {
            try {
                const pix = await createPixPayment({
                    customer: rest.customer,
                    items:    rest.items,
                    total:    rest.total,
                    protocol,
                });

                // Atualiza pedido com dados do PIX
                await updateOrderPayment(protocol, {
                    paymentId:     pix.paymentId,
                    paymentStatus: 'WAITING',
                });

                return res.status(201).json({
                    protocol,
                    paymentMethod: 'pix',
                    pixCode:       pix.pixCode,
                    pixExpiration: pix.pixExpiration,
                    customerName:  rest.customer.name,
                    items:         rest.items,
                });
            } catch (pixErr) {
                console.error('PagBank PIX error:', pixErr.message);
                // Pedido criado mas PIX falhou — retorna erro para o cliente
                return res.status(502).json({
                    error: 'Erro ao gerar PIX. Tente novamente ou escolha outro método de pagamento.',
                    protocol, // retorna o protocolo para o admin acompanhar
                });
            }
        }

        if (paymentMethod === 'card') {
            if (!encryptedCard) {
                return res.status(400).json({ error: 'Dados do cartão não foram criptografados corretamente.' });
            }
            try {
                const card = await createCardPayment({
                    customer:      rest.customer,
                    items:         rest.items,
                    total:         rest.total,
                    protocol,
                    encryptedCard,
                    installments:  installments || 1,
                });

                const paid = card.paymentStatus === 'PAID';

                await updateOrderPayment(protocol, {
                    paymentId:     card.paymentId,
                    paymentStatus: card.paymentStatus,
                    status:        paid ? 'Pago' : 'Pagamento Recusado',
                });

                if (!paid) {
                    return res.status(402).json({
                        error: `Pagamento recusado: ${card.authMessage || 'verifique os dados do cartão.'}`,
                    });
                }

                return res.status(201).json({
                    protocol,
                    paymentMethod: 'card',
                    customerName:  rest.customer.name,
                    items:         rest.items,
                });
            } catch (cardErr) {
                console.error('PagBank card error:', cardErr.message);
                return res.status(502).json({
                    error: cardErr.message.includes('PagBank')
                        ? cardErr.message.replace('PagBank [402]: ', '')
                        : 'Erro ao processar cartão. Verifique os dados e tente novamente.',
                });
            }
        }

        // Pagar no laboratório — retorna protocolo direto
        return res.status(201).json({
            protocol,
            paymentMethod: 'lab',
            customerName:  rest.customer.name,
            items:         rest.items,
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Erro ao criar pedido. Tente novamente.' });
    }
});

app.get('/api/orders', async (_req, res) => {
    try { res.json(await getOrders()); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch orders' }); }
});

app.put('/api/orders/:protocol', async (req, res) => {
    try { res.json(await updateOrder(req.params.protocol, req.body)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update order' }); }
});

// ── PagBank ──────────────────────────────────────────────────────────────────

// Chave pública para o SDK criptografar o cartão no browser
app.get('/api/pagbank/public-key', async (_req, res) => {
    try {
        const data = await getPublicKey();
        res.json({ public_key: data.public_key });
    } catch (e) {
        console.error('Error fetching PagBank public key:', e.message);
        res.status(500).json({ error: 'Erro ao obter chave de criptografia.' });
    }
});

// Webhook — PagBank notifica mudanças de status de pagamento
app.post('/api/pagbank/webhook', async (req, res) => {
    try {
        const body = req.body;
        console.log('[Webhook PagBank]', JSON.stringify(body).substring(0, 300));

        const referenceId = body.reference_id;
        if (!referenceId) return res.sendStatus(200);

        // PIX: status vem em qr_codes
        const qrStatus = body.qr_codes?.[0]?.status;
        // Cartão: status vem em charges
        const chargeStatus = body.charges?.[0]?.status;
        const status = chargeStatus || qrStatus;

        if (!status) return res.sendStatus(200);

        const isPaid = status === 'PAID' || status === 'PAID_BACK';

        await updateOrderPayment(referenceId, {
            paymentStatus: status,
            status: isPaid ? 'Pago' : undefined,
        });

        res.sendStatus(200);
    } catch (e) {
        console.error('Webhook error:', e.message);
        res.sendStatus(200); // sempre 200 pro PagBank não retentar indefinidamente
    }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
