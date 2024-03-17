import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcrypt";
import { Sequelize } from "sequelize";
import nodemailer from "nodemailer";

dotenv.config();
// const db = new pg.Client({
//   user: process.env.PG_USER,
//   host: process.env.PG_HOST,
//   database: process.env.PG_DATABASE,
//   password: process.env.PG_PASSWORD,
//   port: process.env.PG_PORT,
// });

// db.connect();

const db = new Sequelize(process.env.DB_URL, {
  dialect: "postgres",
  logging: false, // remove to see queries in console
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});
db.sync().then(() => console.log("Database connected"));

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(cors());

// Nodemailer transporter setup for Hotmail
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER, // Your Hotmail email address
    pass: process.env.EMAIL_PASS, // Your Hotmail password
  },
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: false,
  },
});

const generateToken = () => {
  return (
    Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2)
  );
};

app.get("/verify/:token", async (req, res) => {
  try {
    const token = req.params.token;
    // console.log("Verification token:", token); // Ensure token is correctly received
    const curruser = await db.query(
      `SELECT * FROM "user" WHERE verification_token = '${token}'`
    );
    // console.log("current user", curruser);

    const userResult = await db.query(
      `SELECT * FROM "user" WHERE verification_token = '${token}'`
    );
    // console.log(userResult[0]);
    // Check if any rows are returned
    if (userResult[0] == 0 || !userResult[0]) {
      return res
        .status(404)
        .send("Invalid verification token or user not found");
    }

    const users = userResult; // Get the inner array containing user objects
    const user = users[0]; // Get the first user object from the inner array

    // console.log("User:", user[0].email); // Log the user retrieved from the database
    const userEmail = user[0].email;
    // Update the verified status
    await db.query(
      `UPDATE "user" SET verified = true WHERE email = '${userEmail}'`
    );

    return res.send("Email successfully verified");
  } catch (error) {
    console.error("Error verifying email:", error);
    return res.status(500).send("Internal server error");
  }
});

app.post("/signup", async (req, res) => {
  try {
    const { firstname, lastname, email, password } = req.body;

    // Check if user with the same email already exists
    const existingUser = await db.query(
      `SELECT * FROM "user" WHERE email = '${email}'`
    );
    // console.log(existingUser[0] == 0);

    // Check if user with the same email already exists
    if (existingUser[0] == 0) {
      // console.log("user not exists");
      // Hash the password before storing it in the database
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate verification token
      const verificationToken = generateToken();

      // Insert new user into the database
      const newUser = await db.query(
        `INSERT INTO "user" (firstname, lastname, email, password, verification_token) VALUES ('${firstname}', '${lastname}', '${email}', '${hashedPassword}', '${verificationToken}') RETURNING *`
      );

      // Send verification email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Email Verification",
        text: `Please click on the following link to verify your email: ${process.env.LOCAL_PORT}/verify/${verificationToken}`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending verification email:", error);
        } else {
          console.log("Verification email sent:", info.response);
        }
      });

      res.send(
        "User successfully created. Please check your email for verification."
      );
    } else {
      return res.send("User already exists");
    }
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).send("Internal server error");
  }
});

// Backend code to handle sign-in requests

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  // Check if the user exists in the database
  const user = await db.query(`SELECT * FROM "user" WHERE email = '${email}'`);
  // console.log(user[0]);
  if (user[0].length === 0) {
    return res.status(404).send("User not found");
  }
  console.log(user[0][0].password);
  // Compare the provided password with the hashed password in the database
  const isValidPassword = await bcrypt.compare(password, user[0][0].password);
  if (!isValidPassword) {
    return res.status(401).send("Invalid password");
  }

  // Check if the user has verified their email
  if (!user[0][0].verified) {
    return res.status(401).send("Email not verified");
  }
  res.send("Sign-in successful");
});

app.get("/api/deals-products", async (req, res) => {
  try {
    const response = await db.query(
      "SELECT DISTINCT * FROM dealsOfTheDay ORDER BY offerpercentage DESC LIMIT 10"
    );
    // console.log(response[0]);
    // const uniqueProducts = response[0][0];
    const uniqueProducts = response[0].reduce((acc, current) => {
      const x = acc.find((item) => item.id === current.id);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    }, []);
    // console.log(uniqueProducts);
    res.send(uniqueProducts);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal server error");
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const productId = req.params.id; // Access id directly from params
    // console.log(req.params);
    const response = await db.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    res.send(response.rows[0]);
    // console.log(response.rows[0]);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).send("Internal server error");
  }
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
