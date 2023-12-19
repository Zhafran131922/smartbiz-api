const Hapi = require('@hapi/hapi');
const Joi = require('@hapi/joi');
const mysql = require('mysql');
const nodemailer = require('nodemailer');
const { generateSixDigitToken } = require('./utils');

const server = Hapi.server({
    port: 3000,
    host: 'localhost',
});


// Konfigurasi koneksi MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'smartbiz',
});

// Connect ke MySQL
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to MySQL');
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'rossonerro59@gmail.com', // your Gmail email address
        pass: 'hvfu xotb sgnt hirm', // your Gmail password or an app-specific password
    },
});

// Endpoint untuk login
server.route({
    method: 'POST',
    path: '/login',
    options: {
        validate: {
            payload: Joi.object({
                username: Joi.string(),
                email: Joi.string(),
                password: Joi.string().required(),
            }).xor('username', 'email'),
        },
    },
    handler: async (request, h) => {
        const { username, email, password } = request.payload;

        // Query ke database untuk verifikasi login
        const query = 'SELECT * FROM login WHERE (username = ? OR email = ?) AND password = ?';

        try {
            const results = await new Promise((resolve, reject) => {
                db.query(query, [username, email, password], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (results.length > 0) {
                return h.response({ status: 'success', message: 'Login berhasil' });
            } else {
                return h.response({ status: 'error', message: 'Login gagal' }).code(401);
            }
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    }
});



server.route({
    method: 'POST',
    path: '/signup',
    options: {
        validate: {
            payload: Joi.object({
                username: Joi.string().required(),
                email: Joi.string().email().required(), // Menambahkan validasi email
                password: Joi.string().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { username, email, password } = request.payload;

        // Cek apakah pengguna sudah terdaftar berdasarkan username atau email
        const existingUserQuery = 'SELECT * FROM login WHERE username = ? OR email = ?';
        
        try {
            const existingUserResults = await new Promise((resolve, reject) => {
                db.query(existingUserQuery, [username, email], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (existingUserResults.length > 0) {
                return h.response({ status: 'error', message: 'Username atau email sudah terdaftar' }).code(400);
            }
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }

        // Tambahkan pengguna baru
        const insertUserQuery = 'INSERT INTO login (username, email, password) VALUES (?, ?, ?)';

        try {
            await new Promise((resolve, reject) => {
                db.query(insertUserQuery, [username, email, password], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return h.response({ status: 'success', message: 'Pendaftaran berhasil' }).code(201);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    }
});


server.route({
    method: 'POST',
    path: '/forgot-password',
    options: {
        validate: {
            payload: Joi.object({
                email: Joi.string().email().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { email } = request.payload;
        const resetToken = generateSixDigitToken(); // Anda dapat menggunakan library lain atau menghasilkan token unik sesuai kebutuhan
        
        // Simpan reset token ke tabel reset_tokens di database
        const insertTokenQuery = 'INSERT INTO reset_tokens (email, token) VALUES (?, ?)';
        await new Promise((resolve, reject) => {
            db.query(insertTokenQuery, [email, resetToken], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        const mailOptions = {
            from: 'rossonerro59@gmail.com', // sender address
            to: email, // list of receivers
            subject: 'Password Reset Token', // Subject line
            text: `Your password reset token is: ${resetToken}`, // plaintext body
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error sending email:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        return { status: 'success', message: 'Reset token sent successfully' };
    },
});

// Endpoint untuk reset password
server.route({
    method: 'POST',
    path: '/reset-password',
    options: {
        validate: {
            payload: Joi.object({
                email: Joi.string().email().required(),
                token: Joi.string().required(),
                newPassword: Joi.string().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { email, token, newPassword } = request.payload;

        // Periksa apakah token cocok dengan yang ada di database
        const findTokenQuery = 'SELECT * FROM reset_tokens WHERE email = ? AND token = ?';
        const tokenResults = await new Promise((resolve, reject) => {
            db.query(findTokenQuery, [email, token], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });

        if (tokenResults.length > 0) {
            // Token valid, ganti password di tabel login
            const updatePasswordQuery = 'UPDATE login SET password = ? WHERE email = ?';
            await new Promise((resolve, reject) => {
                db.query(updatePasswordQuery, [newPassword, email], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            // Hapus token dari tabel reset_tokens (opsional)
            const deleteTokenQuery = 'DELETE FROM reset_tokens WHERE email = ? AND token = ?';
            await new Promise((resolve, reject) => {
                db.query(deleteTokenQuery, [email, token], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return { status: 'success', message: 'Password reset successfully' };
        } else {
            return { status: 'error', message: 'Invalid token' };
        }
    },
});

// ...

// Endpoint untuk input barang
server.route({
    method: 'POST',
    path: '/input_barang',
    options: {
        validate: {
            payload: Joi.object({
                userId: Joi.number().required(), // Id pengguna yang terkait dengan barang
                namaBarang: Joi.string().required(),
                hargaBarang: Joi.number().required(),
                jumlahBarang: Joi.number().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { userId, namaBarang, hargaBarang, jumlahBarang } = request.payload;

        // Cek apakah pengguna dengan ID tertentu ada
        const checkUserQuery = 'SELECT * FROM login WHERE id = ?';

        try {
            const userResults = await new Promise((resolve, reject) => {
                db.query(checkUserQuery, [userId], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (userResults.length === 0) {
                return h.response({ status: 'error', message: 'Pengguna tidak ditemukan' }).code(404);
            }
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }

        // Tambahkan barang ke dalam database
        const insertBarangQuery = 'INSERT INTO barang (user_id, nama_barang, harga_barang, jumlah_barang) VALUES (?, ?, ?, ?)';

        try {
            await new Promise((resolve, reject) => {
                db.query(insertBarangQuery, [userId, namaBarang, hargaBarang, jumlahBarang], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return h.response({ status: 'success', message: 'Input barang berhasil' }).code(201);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    }
});

server.route({
    method: 'POST',
    path: '/create_income',
    options: {
        validate: {
            payload: Joi.object({
                userId: Joi.number().required(),
                tanggal: Joi.date().required(),
                jam: Joi.string().required(),
                barangId: Joi.number().required(), // ID barang yang ingin dijual
                jumlahBarang: Joi.number().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { userId, tanggal, jam, barangId, jumlahBarang } = request.payload;

        // Cari data barang berdasarkan ID
        const getBarangQuery = 'SELECT * FROM barang WHERE id = ? AND user_id = ?';

        try {
            const barangResults = await new Promise((resolve, reject) => {
                db.query(getBarangQuery, [barangId, userId], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (barangResults.length === 0) {
                return h.response({ status: 'error', message: 'Barang tidak ditemukan' }).code(404);
            }

            // Pastikan stok cukup sebelum melakukan penjualan
            if (barangResults[0].jumlah_barang < jumlahBarang) {
                return h.response({ status: 'error', message: 'Stok barang tidak cukup untuk penjualan' }).code(400);
            }

            // Update jumlah barang
            const updateJumlahQuery = 'UPDATE barang SET jumlah_barang = jumlah_barang - ? WHERE id = ? AND user_id = ?';

            await new Promise((resolve, reject) => {
                db.query(updateJumlahQuery, [jumlahBarang, barangId, userId], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

             // Hitung total income
             const totalIncome = jumlahBarang * barangResults[0].harga_barang;

             // Tambahkan data ke tabel income_history
             const insertHistoryQuery = 'INSERT INTO income_history (user_id, tanggal, jam, total_income) VALUES (?, ?, ?, ?)';
 
             await new Promise((resolve, reject) => {
                 db.query(insertHistoryQuery, [userId, tanggal, jam, totalIncome], (err) => {
                     if (err) {
                         reject(err);
                     } else {
                         resolve();
                     }
                 });
             });

             // Setelah menambahkan data ke tabel income_history
            const updateProfitQuery = `
                INSERT INTO total_profit (user_id, total_income, total_expense, total_profit)
                VALUES (?, ?, 0, ?)
                ON DUPLICATE KEY UPDATE
                total_income = total_income + VALUES(total_income),
                total_profit = total_income - total_expense;
            `;

            await new Promise((resolve, reject) => {
                db.query(updateProfitQuery, [userId, totalIncome, totalIncome], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });


            return h.response({ status: 'success', message: 'Create Income berhasil' }).code(201);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    }
});




server.route({
    method: 'POST',
    path: '/create_expense',
    options: {
        validate: {
            payload: Joi.object({
                userId: Joi.number().required(),
                tanggal: Joi.date().required(),
                jam: Joi.string().required(),
                barangId: Joi.number().required(),
                jumlahBarang: Joi.number().required(),
                hargaBarang: Joi.number().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { userId, tanggal, jam, barangId, jumlahBarang, hargaBarang } = request.payload;

        // Tambahkan jumlah barang tanpa memeriksa stok
        const updateJumlahQuery = 'UPDATE barang SET jumlah_barang = jumlah_barang + ? WHERE id = ? AND user_id = ?';

        try {
            await new Promise((resolve, reject) => {
                db.query(updateJumlahQuery, [jumlahBarang, barangId, userId], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            // Hitung total expense
            const totalExpense = jumlahBarang * hargaBarang;

            // Tambahkan data ke tabel expense_history
            const insertHistoryQuery = 'INSERT INTO expense_history (user_id, tanggal, jam, total_expense) VALUES (?, ?, ?, ?)';

            await new Promise((resolve, reject) => {
                db.query(insertHistoryQuery, [userId, tanggal, jam, totalExpense], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            // Setelah menambahkan data ke tabel expense_history
            const updateProfitQuery = `
                INSERT INTO total_profit (user_id, total_income, total_expense, total_profit)
                VALUES (?, 0, ?, ?)
                ON DUPLICATE KEY UPDATE
                total_expense = total_expense + VALUES(total_expense),
                total_profit = total_income - total_expense;
            `;

            await new Promise((resolve, reject) => {
                db.query(updateProfitQuery, [userId, totalExpense, totalExpense], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return h.response({ status: 'success', message: 'Create Expense berhasil' }).code(201);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    }
});


server.route({
    method: 'GET',
    path: '/total_profit/{userId}',
    handler: async (request, h) => {
        const { userId } = request.params;

        const getProfitQuery = 'SELECT * FROM total_profit WHERE user_id = ?';

        try {
            const results = await new Promise((resolve, reject) => {
                db.query(getProfitQuery, [userId], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (results.length > 0) {
                const userProfit = results[0];
                return h.response({ status: 'success', data: userProfit });
            } else {
                return h.response({ status: 'error', message: 'Profit information not found' }).code(404);
            }
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Internal Server Error' }).code(500);
        }
    }
});

server.route({
    method: 'PUT',
    path: '/edit_barang/{barangId}',
    options: {
        validate: {
            params: Joi.object({
                barangId: Joi.number().required(),
            }),
            payload: Joi.object({
                namaBarang: Joi.string().required(),
                hargaBarang: Joi.number().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { barangId } = request.params;
        const { namaBarang, hargaBarang } = request.payload;

        const checkOwnershipQuery = 'SELECT * FROM barang WHERE id = ?';

        try {
            const barangResults = await new Promise((resolve, reject) => {
                db.query(checkOwnershipQuery, [barangId], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (barangResults.length === 0) {
                return h.response({ status: 'error', message: 'Barang tidak ditemukan' }).code(404);
            }

            // Update data barang
            const updateBarangQuery = 'UPDATE barang SET nama_barang = ?, harga_barang = ? WHERE id = ?';

            await new Promise((resolve, reject) => {
                db.query(updateBarangQuery, [namaBarang, hargaBarang, barangId], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return h.response({ status: 'success', message: 'Edit barang berhasil' }).code(200);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    },
});

server.route({
    method: 'DELETE',
    path: '/delete_barang/{barangId}',
    options: {
        validate: {
            params: Joi.object({
                barangId: Joi.number().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { barangId } = request.params;

        const checkOwnershipQuery = 'SELECT * FROM barang WHERE id = ?';

        try {
            const barangResults = await new Promise((resolve, reject) => {
                db.query(checkOwnershipQuery, [barangId], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (barangResults.length === 0) {
                return h.response({ status: 'error', message: 'Barang tidak ditemukan' }).code(404);
            }

            // Hapus data barang
            const deleteBarangQuery = 'DELETE FROM barang WHERE id = ?';

            await new Promise((resolve, reject) => {
                db.query(deleteBarangQuery, [barangId], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return h.response({ status: 'success', message: 'Hapus barang berhasil' }).code(200);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    },
});

server.route({
    method: 'POST',
    path: '/add_barang',
    options: {
        validate: {
            payload: Joi.object({
                userId: Joi.number().required(),
                namaBarang: Joi.string().required(),
                hargaBarang: Joi.number().required(),
                jumlahBarang: Joi.number().required(),
            }),
        },
    },
    handler: async (request, h) => {
        const { userId, namaBarang, hargaBarang, jumlahBarang } = request.payload;

        // Cek apakah pengguna dengan ID tertentu ada
        const checkUserQuery = 'SELECT * FROM login WHERE id = ?';

        try {
            const userResults = await new Promise((resolve, reject) => {
                db.query(checkUserQuery, [userId], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (userResults.length === 0) {
                return h.response({ status: 'error', message: 'Pengguna tidak ditemukan' }).code(404);
            }
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }

        // Tambahkan barang ke dalam database
        const insertBarangQuery = 'INSERT INTO barang (user_id, nama_barang, harga_barang, jumlah_barang) VALUES (?, ?, ?, ?)';

        try {
            await new Promise((resolve, reject) => {
                db.query(insertBarangQuery, [userId, namaBarang, hargaBarang, jumlahBarang], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            return h.response({ status: 'success', message: 'Tambah barang berhasil' }).code(201);
        } catch (error) {
            console.error('Error:', error);
            return h.response({ status: 'error', message: 'Terjadi kesalahan internal' }).code(500);
        }
    },
});



// Start server
const start = async () => {
    try {
        await server.start();
        console.log('Server running on %s', server.info.uri);
    } catch (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
};

start();