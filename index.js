// 📦 Dépendances principales
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcrypt";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

// 🚀 Initialisation Express + HTTP + Socket.io
const app = express();
const httpServer = createServer(app);
export const PORT = process.env.PORT || 5000;

// ⚙️ Middlewares globaux
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 🌍 Connexion MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export let db,
  usersCollection,
  profilesCollection,
  friendsCollection,
  signalementCollection,
  messagesCollection;

export const dbReady = (async function initDB() {
  try {
    await client.connect();
    db = client.db("CampusConnect");
    usersCollection = db.collection("user");
    profilesCollection = db.collection("profiles");
    friendsCollection = db.collection("friends");
    signalementCollection = db.collection("signalements");
    messagesCollection = db.collection("messages");
    console.log("✅ MongoDB connecté");
  } catch (err) {
    console.error("❌ Erreur de connexion à MongoDB :", err);
  }
})();

// --- Multer configuration ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// =========================
// 🚹 UTILISATEURS
// =========================
app.post("/register/user", async (req, res) => {
  const { firstName, lastName, email, password, sexe } = req.body;
  if (!firstName || !lastName || !email || !password || !sexe)
    return res.status(400).json({ message: "Tous les champs sont obligatoires" });

  try {
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email déjà utilisé" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });

    await profilesCollection.insertOne({
      userId: result.insertedId,
      firstName,
      lastName,
      sexe,
      bio: "",
      filiere: "",
      niveau: "",
      interests: [],
      isTutor: false,
      campus: "",
      photoUrl: "",
      createdAt: new Date(),
    });

    res.status(201).json({
      message: "Utilisateur enregistré avec succès ✅",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de l’enregistrement" });
  }
});

app.post("/login/user", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email et mot de passe requis" });

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(401).json({ message: "Mot de passe incorrect" });

    const profile = await profilesCollection.findOne({ userId: user._id });
    res.status(200).json({ message: "Connexion réussie ✅", profile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la connexion" });
  }
});

app.put("/user/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    res.status(200).json({ message: "Utilisateur mis à jour ✅" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la mise à jour" });
  }
});

app.delete("/delete/user/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const objectId = new ObjectId(id);
    const deletedUser = await usersCollection.deleteOne({ _id: objectId });
    if (deletedUser.deletedCount === 0)
      return res.status(404).json({ message: "Utilisateur non trouvé" });

    await profilesCollection.deleteOne({ userId: objectId });
    await friendsCollection.deleteMany({
      $or: [{ userId: objectId }, { friendId: objectId }],
    });
    await messagesCollection.deleteMany({
      $or: [{ senderId: objectId }, { receiverId: objectId }],
    });

    res.status(200).json({
      message: "Utilisateur et ses données supprimés ✅",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la suppression" });
  }
});

// =========================
// 🧑 PROFILS
// =========================
app.get("/profiles/user/:id", async (req, res) => {
  try {
    const profile = await profilesCollection.findOne({
      userId: new ObjectId(req.params.id),
    });
    if (!profile) return res.status(404).json({ message: "Profil non trouvé" });
    res.json({ message: "Profil trouvé ✅", profil: profile });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.put("/profiles/user/:id", async (req, res) => {
  const { interests, ...updateData } = req.body;
  try {
    if (interests) {
      await profilesCollection.updateOne(
        { userId: new ObjectId(req.params.id) },
        { $addToSet: { interests: { $each: interests } } }
      );
    }
    const result = await profilesCollection.updateOne(
      { userId: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    const updated = await profilesCollection.findOne({
      userId: new ObjectId(req.params.id),
    });
    res.json({ message: `${result.modifiedCount} champs modifiés ✅`, profil: updated });
  } catch (error) {
    res.status(500).json({ message: "Erreur mise à jour profil" });
  }
});

// =========================
// 👥 AMIS
// =========================
app.post("/friends/add", async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId)
    return res.status(400).json({ message: "Ids manquants" });
  try {
    const exist = await friendsCollection.findOne({ userId, friendId });
    if (exist) return res.status(400).json({ message: "Déjà amis" });
    await friendsCollection.insertOne({
      userId,
      friendId,
      createdAt: new Date(),
    });
    res.status(201).json({ message: "Ami ajouté ✅" });
  } catch (error) {
    res.status(500).json({ message: "Erreur ajout ami" });
  }
});

app.get("/friends/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const friends = await friendsCollection.find({ userId: id }).toArray();
    res.json({ message: "Amis récupérés ✅", friends });
  } catch (error) {
    res.status(500).json({ message: "Erreur récupération amis" });
  }
});

// =========================
// 💬 MESSAGES
// =========================
app.get("/messages/:senderId/:receiverId", async (req, res) => {
  const { senderId, receiverId } = req.params;
  try {
    const messages = await messagesCollection
      .find({
        $or: [
          { senderId: new ObjectId(senderId), receiverId: new ObjectId(receiverId) },
          { senderId: new ObjectId(receiverId), receiverId: new ObjectId(senderId) },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();
    res.json({ message: "Messages récupérés ✅", messages });
  } catch (error) {
    res.status(500).json({ message: "Erreur récupération messages" });
  }
});

// =========================
// 🚨 SIGNALEMENTS
// =========================
app.post("/signalement", async (req, res) => {
  const { reporterId, reportedId, reason } = req.body;
  if (!reporterId || !reportedId || !reason)
    return res.status(400).json({ message: "Champs requis manquants" });
  try {
    await signalementCollection.insertOne({
      reporterId,
      reportedId,
      reason,
      createdAt: new Date(),
    });
    res.status(201).json({ message: "Signalement enregistré ✅" });
  } catch (error) {
    res.status(500).json({ message: "Erreur signalement" });
  }
});

// =========================
// ⚡ SOCKET.IO
// =========================
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`🟢 Nouveau client connecté : ${socket.id}`);

  socket.on("send_message", async (data) => {
    const { senderId, receiverId, content } = data;
    const msg = {
      senderId: new ObjectId(senderId),
      receiverId: new ObjectId(receiverId),
      content,
      createdAt: new Date(),
    };
    await messagesCollection.insertOne(msg);
    io.emit("receive_message", msg);
  });

  socket.on("disconnect", () =>
    console.log(`🔴 Client déconnecté : ${socket.id}`)
  );
});

// 🔌 Fermeture MongoDB
process.on("SIGINT", async () => {
  await client.close();
  console.log("🔌 Connexion MongoDB fermée");
  process.exit(0);
});



export default app;
