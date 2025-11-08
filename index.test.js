import test, { describe } from "node:test";
import assert from "node:assert";
import request from "supertest";
import app, { dbReady ,profilesCollection} from "./index.js";
import { ObjectId } from "mongodb";
let userId;

describe("User", () => {
  //Fait
  test("POST /register/user - devrait créer utilisateur et profil", async () => {
  await dbReady;

  const res = await request(app)
    .post("/register/user")
    .send({
      firstName: "Joe",
      lastName: "Doe",
      email: "joe@gmail.com",
      password: "joe1235",
      sexe: "male",
    });

  userId = res.body.userId;
  assert.strictEqual(res.statusCode, 201);
  assert.ok(userId);

  // ✅ Vérifier le profil
  
  const profile = await profilesCollection.findOne({ userId: new ObjectId(userId) });
  assert.ok(profile, "Le profil n'a pas été créé !");
  assert.strictEqual(profile.firstName, "Joe");
  assert.strictEqual(profile.lastName, "Doe");
  });
  test("POST /register/user - devrait échouer si un champ obligatoire est manquant", () => {});
  //Fait
  test("POST /register/user - devrait échouer si l’email est déjà utilisé",async () => {
    await dbReady; // ✅ on attend que MongoDB soit connecté

    const res = await request(app)
      .post("/register/user")
      .send({
        firstName: "Joe2",
        lastName: "Doe2",
        email: "joe@gmail.com",
        password: "joe1235",
        sexe: "male",
      });

    
    assert.strictEqual(res.statusCode, 400);
  });

  test("POST /login/user - devrait connecter un utilisateur valide", () => {});
  test("POST /login/user - devrait échouer avec un mauvais mot de passe", () => {});
  test("POST /login/user - devrait échouer si l’utilisateur n’existe pas", () => {});

  test("PUT /user/:id - devrait mettre à jour les informations de l’utilisateur", () => {});
  test("PUT /user/:id - devrait renvoyer 404 si l’utilisateur n’existe pas", () => {});
  
  test("DELETE /delete/user/:id - devrait supprimer l’utilisateur et ses données associées", () => {});
  test("DELETE /delete/user/:id - devrait renvoyer 404 si l’utilisateur n’existe pas", () => {});
});

describe("Profile", () => {
  test("GET /profiles/user/:id - devrait récupérer le profil d’un utilisateur existant", () => {});
  test("GET /profiles/user/:id - devrait renvoyer 404 si le profil n’existe pas", () => {});

  test("PUT /profiles/user/:id - devrait mettre à jour le profil utilisateur", () => {});
  test("PUT /profiles/user/:id - devrait ajouter des centres d’intérêt (interests)", () => {});
});

describe("Photo", () => {
  test("POST /photo - devrait uploader une photo de profil", () => {});
  test("POST /photo - devrait échouer si aucun fichier n’est envoyé", () => {});
  test("GET /user/photo/:id - devrait récupérer la photo d’un utilisateur", () => {});
  test("GET /user/photo/:id - devrait renvoyer 404 si l’utilisateur n’a pas de photo", () => {});
});

describe("Friends", () => {
  test("POST /friends/user - devrait envoyer une demande d'ami", () => {});
  test("POST /friends/user - devrait échouer si une demande existe déjà", () => {});

  test("PUT /friends/user - devrait accepter une demande d'ami", () => {});
  test("PUT /friends/user - devrait refuser une demande d'ami", () => {});
  test("PUT /friends/user - devrait échouer si la demande n'existe pas", () => {});

  test("DELETE /friends/user - devrait supprimer une relation d'amitié", () => {});
  test("DELETE /friends/user - devrait échouer si la relation n'existe pas", () => {});

  test("GET /friends/:status/user/:id - devrait récupérer les amis selon le statut accepté", () => {});
  test("GET /friends/:status/user/:id - devrait récupérer les amis selon le statut refusé", () => {});
  test("GET /friends/:status/user/:id - devrait récupérer les amis selon le statut pending", () => {});
});

describe("Messages", () => {
  test("POST /messages/send - devrait envoyer un message", () => {});
  test("POST /messages/send - devrait échouer si des champs sont manquants", () => {});

  test("GET /messages/conversation/:userId1/:userId2 - devrait récupérer la conversation", () => {});
  test("GET /messages/conversation/:userId1/:userId2 - devrait échouer si les utilisateurs n'existent pas", () => {});
});

describe("Signalements", () => {
  test("POST /messages/signal/send - devrait envoyer un signalement", () => {});
  test("POST /messages/signal/send - devrait échouer si des champs sont manquants", () => {});
  test("GET /messages/signal - devrait récupérer tous les signalements", () => {});
});
