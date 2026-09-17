const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.put('/financials', authController.updateFinancials);
router.get('/user/:email', authController.getUser);

module.exports = router;
