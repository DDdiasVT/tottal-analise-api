const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { getExams, createExam, updateExam, deleteExam, createOrder } = require('./services/sheetsService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic Route
app.get('/', (req, res) => {
    res.send('Tottal Análise API is running');
});

// CRUD Routes for Exams
app.get('/api/exams', async (req, res) => {
    try {
        const exams = await getExams();
        res.json(exams);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

app.post('/api/exams', async (req, res) => {
    try {
        const newExam = await createExam(req.body);
        res.status(201).json(newExam);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create exam' });
    }
});

app.put('/api/exams/:id', async (req, res) => {
    try {
        const updatedExam = await updateExam(req.params.id, req.body);
        res.json(updatedExam);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update exam' });
    }
});

app.delete('/api/exams/:id', async (req, res) => {
    try {
        await deleteExam(req.params.id);
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = await createOrder(req.body);
        res.status(201).json(order);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order. Make sure "Pedidos" sheet exists.' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { getOrders } = require('./services/sheetsService');
        const orders = await getOrders();
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

app.put('/api/orders/:protocol', async (req, res) => {
    try {
        const { updateOrder } = require('./services/sheetsService');
        const updatedOrder = await updateOrder(req.params.protocol, req.body);
        res.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
