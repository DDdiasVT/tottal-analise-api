const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function getExams() {
    const { data, error } = await supabase
        .from('exams')
        .select('*')
        .order('name');

    if (error) throw error;
    return data;
}

async function createExam(exam) {
    const id = Date.now().toString();
    const { data, error } = await supabase
        .from('exams')
        .insert([{
            id,
            name: exam.name,
            price: exam.price,
            prazo: exam.prazo || '',
            preparo: exam.preparo || '',
            jejum: exam.jejum || '',
            description: exam.description,
            category: exam.category || 'Geral'
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateExam(id, exam) {
    const { data, error } = await supabase
        .from('exams')
        .update({
            name: exam.name,
            price: exam.price,
            prazo: exam.prazo || '',
            preparo: exam.preparo || '',
            jejum: exam.jejum || '',
            description: exam.description,
            category: exam.category || 'Geral'
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function deleteExam(id) {
    const { error } = await supabase
        .from('exams')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

async function createOrder(orderData) {
    const { data: lastOrder } = await supabase
        .from('orders')
        .select('protocol')
        .order('protocol', { ascending: false })
        .limit(1);

    const lastNum = lastOrder && lastOrder.length > 0 ? parseInt(lastOrder[0].protocol, 10) : 0;
    const protocol = String(lastNum + 1).padStart(5, '0');

    let formattedDate = orderData.scheduledDate || '';
    if (formattedDate) {
        const [year, month, day] = formattedDate.split('-');
        formattedDate = `${day}/${month}/${year}`;
    }

    const { error } = await supabase
        .from('orders')
        .insert([{
            protocol,
            customer_name: orderData.customer.name,
            customer_cpf: orderData.customer.cpf,
            customer_phone: orderData.customer.phone,
            customer_email: orderData.customer.email,
            items: orderData.items.map(i => ({ name: i.name, price: i.price, prazo: i.prazo })),
            total: orderData.total,
            collection_type: orderData.collectionType || 'Laboratório',
            address: orderData.address || null,
            scheduled_date: formattedDate,
            payment_method: orderData.paymentMethod || 'lab',
            status: 'A Realizar',
            observation: '',
            payment_id: orderData.paymentId || null,
            payment_status: orderData.paymentStatus || 'pending',
            pix_code: orderData.pixCode || null,
            pix_expiration: orderData.pixExpiration || null,
        }]);

    if (error) throw error;
    return { protocol, ...orderData };
}

async function getOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(row => ({
        protocol: row.protocol,
        customer: {
            name: row.customer_name,
            cpf: row.customer_cpf,
            phone: row.customer_phone,
            email: row.customer_email
        },
        items: row.items,
        total: row.total,
        timestamp: new Date(row.created_at).toLocaleString('pt-BR'),
        collectionType: row.collection_type,
        address: row.address,
        scheduledDate: row.scheduled_date,
        status: row.status || 'A Realizar',
        observation: row.observation || ''
    }));
}

async function updateOrder(protocol, updateData) {
    const { error } = await supabase
        .from('orders')
        .update({
            status: updateData.status,
            observation: updateData.observation
        })
        .eq('protocol', protocol);

    if (error) throw error;
    return { protocol, ...updateData };
}

async function updateOrderPayment(protocol, paymentData) {
    const updates = {};
    if (paymentData.paymentStatus !== undefined) updates.payment_status = paymentData.paymentStatus;
    if (paymentData.paymentId     !== undefined) updates.payment_id     = paymentData.paymentId;
    if (paymentData.status        !== undefined) updates.status         = paymentData.status;

    const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('protocol', protocol);

    if (error) throw error;
    return { protocol };
}

module.exports = { getExams, createExam, updateExam, deleteExam, createOrder, getOrders, updateOrder, updateOrderPayment };
