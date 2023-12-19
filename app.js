const Hapi = require('@hapi/hapi');
const mysql = require('mysql2/promise');
const Joi = require('@hapi/joi');

let server;
let connection;

const init = async () => {
    server = Hapi.server({
        port: 3000,
        host: 'localhost',
    });

    const dbConfig = {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'smartbiz',
    };

    connection = await mysql.createConnection(dbConfig);

    server.route({
        method: 'POST',
        path: '/addProduct',
        handler: async (request, h) => {
            const { businessType, productName, quantity, price } = request.payload;

            try {
                // Insert data ke database
                const [rows] = await connection.execute(
                    'INSERT INTO products (jenis_usaha, nama_barang, jumlah, harga) VALUES (?, ?, ?, ?)',
                    [businessType, productName, quantity, price]
                );

                return { success: true, message: 'Product added successfully' };
            } catch (error) {
                console.error(error);
                return { success: false, message: 'Failed to add product' };
            }
        },
    });

server.route({
    method: 'POST',
    path: '/createIncome',
    options: {
        validate: {
            payload: Joi.object({
                date: Joi.string().isoDate().required(),
                jam: Joi.string().regex(/^\d{2}:\d{2}:\d{2}$/).required(), // Gunakan regex untuk validasi waktu
                sales: Joi.array().items(
                    Joi.object({
                        id_barang: Joi.number().integer().required(),
                        quantity: Joi.number().integer().required()
                    })
                ).required(),
                user_id: Joi.number().integer().required()
            })
        }
    },
    handler: async (request, h) => {
        const { date, jam, sales, user_id } = request.payload;

        try {
            // Hitung total pemasukan secara otomatis
            const totalIncome = await sales.reduce(async (totalPromise, sale) => {
                const total = await totalPromise;

                // Ambil harga barang dari database
                const [product] = await connection.execute(
                    'SELECT harga FROM products WHERE id = ?',
                    [sale.id_barang]
                );

                // Tambahkan ke total
                return total + sale.quantity * product[0].harga;
            }, Promise.resolve(0));

            // Insert data ke tabel income dengan user_id
            await connection.execute(
                'INSERT INTO income (tanggal, jam, total_pemasukan, user_id) VALUES (?, ?, ?, ?)',
                [date, jam, totalIncome, user_id]
            );

            await connection.execute(
                'INSERT INTO user_income_history (tanggal, jam, total_pemasukan, user_id) VALUES (?, ?, ?, ?)',
                [date, jam, totalIncome, user_id]
            );

            console.log('Data successfully added to user_income_history');

            return h.response({ success: true, message: 'Income recorded successfully' });
        } catch (error) {
            console.error(error);
            return h.response({ success: false, message: 'Failed to record income' }).code(500);
        }
    },
});


// Untuk endpoint createOutcome
server.route({
    method: 'POST',
    path: '/createOutcome',
    options: {
        validate: {
            payload: Joi.object({
                tanggal: Joi.string().isoDate().required(),
                jam: Joi.string().regex(/^\d{2}:\d{2}:\d{2}$/).required(), // Tambahkan validasi waktu
                id_barang: Joi.number().integer().required(),
                harga_barang: Joi.number().precision(2).required(),
                jumlah_barang: Joi.number().integer().required(),
                user_id: Joi.number().integer().required()
            }),
        },
    },
    handler: async (request, h) => {
        const { tanggal, jam, id_barang, harga_barang, jumlah_barang, user_id } = request.payload;

        try {
            // Hitung total pengeluaran
            const total_pengeluaran = harga_barang * jumlah_barang;

            const [user] = await connection.execute(
                'SELECT * FROM login WHERE id = ?',
                [user_id]
            );

            
            if (!user || user.length === 0) {
                return h.response({ success: false, message: 'User not found' }).code(404);
            }

            // Insert data ke tabel outcome dengan user_id
            await connection.execute(
                'INSERT INTO outcome (tanggal, jam, id_barang, harga_barang, jumlah_barang, total_pengeluaran, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [tanggal, jam, id_barang, harga_barang, jumlah_barang, total_pengeluaran, user_id]
            );

            await connection.execute(
                'INSERT INTO user_outcome_history (tanggal, jam, id_barang, harga_barang, jumlah_barang, total_pengeluaran, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [tanggal, jam, id_barang, harga_barang, jumlah_barang, total_pengeluaran, user_id]
            );

            return h.response({ success: true, message: 'Outcome recorded successfully' });
        } catch (error) {
            console.error(error);
            return h.response({ success: false, message: 'Failed to record outcome' }).code(500);
        }
    },
});

// Untuk mendapatkan detail pendapatan pengguna
server.route({
    method: 'GET',
    path: '/userIncome/{user_id}',
    handler: async (request, h) => {
        const { user_id } = request.params;

        try {
            const [results] = await connection.execute(
                'SELECT * FROM income WHERE user_id = ?',
                [user_id]
            );

            return { success: true, data: results };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'Gagal mengambil detail pendapatan' };
        }
    },
});

// Untuk mendapatkan detail pengeluaran pengguna
server.route({
    method: 'GET',
    path: '/userOutcome/{user_id}',
    handler: async (request, h) => {
        const { user_id } = request.params;

        try {
            const [results] = await connection.execute(
                'SELECT * FROM outcome WHERE user_id = ?',
                [user_id]
            );

            return { success: true, data: results };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'Gagal mengambil detail pengeluaran' };
        }
    },
});

server.route({
    method: 'GET',
    path: '/userIncomeHistory/{user_id}',
    handler: async (request, h) => {
        const { user_id } = request.params;

        try {
            const [results] = await connection.execute(
                'SELECT * FROM user_income_history WHERE user_id = ?',
                [user_id]
            );

            return { success: true, data: results };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'Gagal mengambil histori pendapatan' };
        }
    },
});

server.route({
    method: 'GET',
    path: '/userOutcomeHistory/{user_id}',
    handler: async (request, h) => {
        const { user_id } = request.params;

        try {
            const [results] = await connection.execute(
                'SELECT * FROM user_outcome_history WHERE user_id = ?',
                [user_id]
            );

            return { success: true, data: results };
        } catch (error) {
            console.error(error);
            return { success: false, message: 'Gagal mengambil histori pengeluaran' };
        }
    },
});




    // ... (Tambahkan rute lainnya jika diperlukan)

    await server.start();
    console.log('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
    if (server) {
        server.stop(); // Hentikan server sebelum keluar
    }
    process.exit(1);
});

init();
