// 📦 Dépendances
import dotenv from 'dotenv'
import express from 'express'
import cors from'cors'
import multer from 'multer'
import bcrypt from "bcrypt";
import  { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

// 🚀 Initialisation de l'app Express

const app = express();
export const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" })); // Limite JSON pour gros fichiers

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
  messagesCollection

// --- Initialisation de la base de données ---
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
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // limite à 5MB
});

// --- ROUTES ---
// Upload photo de profil
app.post("/photo", upload.single("photo"), async (req, res) => {
  try {
    const { userId } = req.body;
    const photoPath = `/uploads/${req.file.filename}`;
    await profilesCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { photoUrl: photoPath } }
    );
    res.json({ message: "Photo enregistrée ✅", path: photoPath });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer photo d'un utilisateur
app.get("/user/photo/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Id requis" });

  try {
    const profile = await profilesCollection.findOne({
      userId: new ObjectId(id),
    });

    if (!profile || !profile.photoUrl) {
      return res
        .status(404)
        .json({ message: "Aucune photo enregistrée pour cet utilisateur" });
    }

    const fullUrl = `${req.protocol}://${req.get("host")}${profile.photoUrl}`;
    res.status(200).json({ message: "Photo récupérée ✅", photoUrl: fullUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la récupération de la photo" });
  }
});

// --- ROUTES UTILISATEURS ---
// Enregistrement utilisateur
app.post("/register/user", async (req, res) => {
  const { firstName, lastName, email, password, sexe } = req.body;
  if (!firstName || !lastName || !sexe||!email || !password) {
    return res.status(400).json({ message: "Tous les champs sont obligatoires" });
  }

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

    res
      .status(201)
      .json({ message: "Utilisateur enregistré avec succès ✅", userId: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de l’enregistrement" });
  }
});

// Connexion utilisateur
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

// Supprimer un utilisateur
app.delete("/delete/user/:id", async (req, res) => {
  const { id } = req.params;
  if (!id)
    return res.status(400).json({ message: "L'ID de l'utilisateur est requis ❌" });

  try {
    const objectId = new ObjectId(id);
    const deletedUser = await usersCollection.deleteOne({ _id: objectId });
    if (deletedUser.deletedCount === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé ❌" });
    }

    const deletedProfile = await profilesCollection.deleteOne({ userId: objectId });
    const deletedFriends = await friendsCollection.deleteMany({
      $or: [{ userId: objectId }, { friendId: objectId }],
    });
    const deletedMessages = await messagesCollection.deleteMany({
      $or: [{ senderId: objectId }, { receiverId: objectId }],
    });

    res.status(200).json({
      message: "Toutes les données de cet utilisateur ont été supprimées ✅",
      details: {
        profilSupprimé: deletedProfile.deletedCount > 0,
        amisSupprimés: deletedFriends.deletedCount,
        messagesSupprimés: deletedMessages.deletedCount,
      },
    });
  } catch (error) {
    console.error("❌ Erreur dans /delete/user :", error);
    res
      .status(500)
      .json({ message: "Erreur interne lors de la suppression de l’utilisateur" });
  }
});

// Modifier utilisateur
app.put("/user/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) return res.status(400).json({ message: "Id requis" });

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.status(200).json({ message: "Utilisateur mis à jour ✅" });
  } catch (error) {
    console.error("Erreur dans PUT /user/:id :", error);
    res.status(500).json({ message: "Erreur lors de la mise à jour de l'utilisateur" });
  }
});

// Récupérer profil utilisateur
app.get("/profiles/user/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Id requis" });

  try {
    const profile = await profilesCollection.findOne({ userId: new ObjectId(id) });
    if (!profile) return res.status(404).json({ message: "Profil non trouvé" });

    res.status(200).json({ message: "Profil trouvé ✅", profil: profile });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id :", error);
    res.status(500).json({ message: "Erreur lors de la récupération du profil" });
  }
});

// Modifier profil utilisateur
app.put("/profiles/user/:id", async (req, res) => {
  const { id } = req.params;
  const { interests, ...updateData } = req.body;

  try {
    if (interests) {
      await profilesCollection.updateOne(
        { userId: new ObjectId(id) },
        { $addToSet: { interests: { $each: interests } } }
      );
    }

    const result = await profilesCollection.updateOne(
      { userId: new ObjectId(id) },
      { $set: updateData }
    );

    const updatedProfile = await profilesCollection.findOne({ userId: new ObjectId(id) });
    res.status(200).json({
      message: `${result.modifiedCount} champs mis à jour ✅`,
      profil: updatedProfile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id (PUT) :", error);
    res.status(500).json({ message: "Erreur lors de la mise à jour du profil" });
  }
});

// 🔌 Fermer proprement MongoDB
process.on("SIGINT", async () => {
  await client.close();
  console.log("🔌 Connexion MongoDB fermée");
  process.exit(0);
});



export default app;