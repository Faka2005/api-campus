// 📦 Dépendances
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// 🚀 Initialisation de l'app Express
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 🌍 Connexion MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, usersCollection;

// --- Initialisation de la base de données ---
async function initDB() {
  try {
    await client.connect();
    db = client.db("CampusConnect");
    usersCollection = db.collection("user");
    profilesCollection = db.collection("profiles");
    friendsCollection=db.collection("friends");
    console.log("✅ Connecté à MongoDB Atlas !");
  } catch (err) {
    console.error("❌ Erreur de connexion à MongoDB :", err);
  }
}

initDB();

// --- ROUTE : Enregistrement d’un utilisateur et d'un profil vide---
app.post("/register/user", async (req, res) => {
  const { firstName, lastName, email, password ,sexe} = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res
      .status(400)
      .json({ message: "Tous les champs sont obligatoires" });
  }
  
  try {
    // Vérifie si l'utilisateur existe déjà
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email déjà utilisé" });
    }

    // Hash du mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insertion dans la base
    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });
    const profil = await profilesCollection.insertOne({
      userId: new ObjectId(result.insertedId),
      firstName:firstName,
      lastName:lastName,
      sexe:sexe,
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
    console.error("Erreur dans /register/user :", error);
    res.status(500).json({ message: "Erreur lors de l’enregistrement" });
  }
});

// --- ROUTE : Connexion d’un utilisateur ---
app.post("/login/user", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe requis" });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const profile = await profilesCollection.findOne({
      userId:  new ObjectId(user._id),
    });


    res.status(200).json({
      message: "Connexion réussie ✅",
      profile: profile,
    });
  } catch (error) {
    console.error("Erreur dans /login/user :", error);
    res.status(500).json({ message: "Erreur lors de la connexion" });
  }
});

// --- ROUTE : Modifie les informations d’un  utilisateur ---
app.put("/user/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({ mesage: "Id requis" });
  }
  try {
    const result = await usersCollection.updateData(
      { userId: new ObjectId(id) },
      { $set: updateData }
    );
  } catch (error) {}
});

// --- ROUTE : Renvoie les informations d’un profil utilisateur ---
app.get("/profiles/user/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Id requis" });
  }

  try {
    // Récupération du profil via le userId
    const profile = await profilesCollection.findOne({
      userId: new ObjectId(id),
    });

    if (!profile) {
      return res.status(404).json({ message: "Profil non trouvé" });
    }

    res.status(200).json({
      message: "Profil trouvé ✅",
      profil: profile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération du profil" });
  }
});

// --- ROUTE : Modifie les informations d’un profil utilisateur ---
app.put("/profiles/user/:id", async (req, res) => {
  const { id } = req.params;
  const { interests, ...updateData } = req.body;

  try {
    const updateObj = { ...updateData };

    //Permets de rajouter un élement à la liste des intérêts de l'utilsateur
    if (!interests) {
      await profilesCollection.updateOne(
        { userId: new ObjectId(id) },
        { $addToSet: { interests: { $each: interests } } }
      );
    }

    const result = await profilesCollection.updateOne(
      { userId: new ObjectId(id) },
      { $set: updateObj }
    );

    const updatedProfile = await profilesCollection.findOne({
      userId: new ObjectId(id),
    });

    res.status(200).json({
      message: `${result.modifiedCount} champs mis à jour ✅`,
      profil: updatedProfile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id (PUT) :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la mise à jour du profil" });
  }
});

// --- ROUTE : Récupére tous le profil de chaque  utilisateur ---
app.get("/profiles/user/",async(req,res)=>{
try {
    // Récupération du profil via le userId
    const profile = await profilesCollection.find().toArray();

    if (!profile || profile.lenght===0) {
      return res.status(404).json({ message: "Profil non trouvé" });
    }

    res.status(200).json({
      message: "Profil trouvé ✅",
      profil: profile,
    });
  } catch (error) {
    console.error("Erreur dans /profiles/user/:id :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des profil" });
  }

})

// --- ROUTE : Ajoute un ami à un utilisateur ---
app.post("/friends/user", async (req, res) => {
  const { id1, id2 } = req.body;

  if (!id1 || !id2) {
    return res
      .status(400)
      .json({ message: "Les deux identifiants sont obligatoires" });
  }

  try {
    // Vérifie si cette amitié existe déjà
    const existingFriendship = await friendsCollection.findOne({
      $or: [
        { userId:  new ObjectId(id1), friendId: new ObjectId(id2) },
        { userId:  new ObjectId(id2), friendId: new ObjectId(id1) }
      ]
    });

    if (existingFriendship) {
      return res.status(400).json({ message: "Vous êtes déjà amis" });
    }

    // Ajoute les deux sens de l’amitié (symétrique)
    await friendsCollection.insertMany([
      { userId: new ObjectId(id1), friendId: new ObjectId(id2), createdAt: new Date() },
      { userId: new ObjectId(id2), friendId: new ObjectId(id1), createdAt: new Date() }
    ]);

    res.status(201).json({ message: "Ami ajouté avec succès ✅" });
  } catch (error) {
    console.error("Erreur dans /friends/user :", error);
    res.status(500).json({ message: "Erreur lors de l’ajout de l’ami" });
  }
});

// --- ROUTE : Récupère les amis d’un utilisateur ---
app.get("/friends/user/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Id requis" });
  }

  try {
    // Trouve toutes les relations d’amis pour cet utilisateur
    const friends = await friendsCollection
      .find({ userId: new ObjectId(id) })
      .toArray();

    if (!friends || friends.length === 0) {
      return res.status(404).json({ message: "Aucun ami trouvé" });
    }

    // Récupère les profils de chaque ami
    const friendIds = friends.map(f => f.friendId);
    const friendProfiles = await profilesCollection
      .find({ userId: { $in: friendIds } })
      .toArray();

    res.status(200).json({
      message: "Amis trouvés ✅",
      amis: friendProfiles,
    });
  } catch (error) {
    console.error("Erreur dans /friends/user/:id :", error);
    res.status(500).json({ message: "Erreur lors de la récupération des amis" });
  }
});


// 🔌 Fermer proprement la connexion MongoDB si le serveur s'arrête
process.on("SIGINT", async () => {
  await client.close();
  console.log("🔌 Connexion MongoDB fermée");
  process.exit(0);
});

// 🚀 Lancement du serveur
app.listen(PORT, () =>
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`)
);

/*Schèmas profils
  userId: new ObjectId(result.insertedId),
  bio: "",
  filiere: "",
  niveau: "",
  interests: [],
  isTutor: false,
  campus: "",
  photoUrl: "",
  createdAt: new Date(),
*/
/*Schèmas des cours d'un tutor

  "_id": Id de l'utilisateur,
  "name": Nom du cours,
  "filiere": "La fillière du cours"

*/