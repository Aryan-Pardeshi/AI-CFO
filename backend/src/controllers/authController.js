const userModel = require('../models/userModel');

const authController = {
  async register(req, res) {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }

      // TODO: In a real app, hash the password using bcrypt here before saving
      const passwordHash = password; // WARNING: Placeholder. 

      const newUser = await userModel.createUser({
        name,
        email,
        passwordHash
      });

      res.status(201).json({ message: 'User registered successfully', user: { name: newUser.name, email: newUser.email } });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await userModel.getUserByEmail(email);

      if (!user || user.passwordHash !== password) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // TODO: In a real app, generate and return a JWT here
      res.status(200).json({ 
        message: 'Login successful', 
        user: { name: user.name, email: user.email },
        hasOnboarded: !!user.financials
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async googleAuth(req, res) {
    try {
      // In a strict production app, you would verify an ID Token or Code here using google-auth-library.
      // For this MVP, we will accept the verified profile data sent from the frontend after it authenticates with Google.
      const { email, name, googleId } = req.body;

      if (!email || !googleId) {
        return res.status(400).json({ error: 'Incomplete Google profile data' });
      }

      let user = await userModel.getUserByEmail(email);
      
      // If user doesn't exist, create them automatically
      if (!user) {
        user = await userModel.createUser({
          name: name || 'Google User',
          email: email,
          passwordHash: `google_oauth_${googleId}` // Placeholder for external auth flag
        });
      }

      // TODO: In a real app, generate and return a JWT here
      res.status(200).json({ 
        message: 'Google Auth successful', 
        user: { name: user.name, email: user.email },
        hasOnboarded: !!user.financials
      });
    } catch (error) {
      console.error('Google Auth error:', error);
      res.status(500).json({ error: 'Internal server error during Google Auth' });
    }
  },

  async updateFinancials(req, res) {
    try {
      const { email, financials } = req.body;
      if (!email || !financials) {
        return res.status(400).json({ error: 'Email and financials are required' });
      }

      const updatedUser = await userModel.updateFinancials(email, financials);
      res.status(200).json({ message: 'Financials updated', user: updatedUser });
    } catch (error) {
      console.error('Update financials error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getUser(req, res) {
    try {
      const email = req.params.email;
      if (!email) return res.status(400).json({ error: 'Email required' });

      const user = await userModel.getUserByEmail(email);
      if (!user) return res.status(404).json({ error: 'User not found' });

      res.status(200).json({ user });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = authController;
