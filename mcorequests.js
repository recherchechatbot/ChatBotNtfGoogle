const express = require('express');
const MCO_URL = process.env.MCO_URL;

module.exports = class Mco {
    loginMCommerce(email, mdp, idrc) {
        return new Promise((resolve, reject) => {
            request({
                url: MCO_URL + 'api/v1/loginRc',
                method: 'POST',
                body: {
                    email: email,
                    motdepasse: mdp,
                    idrc: idrc,
                    veutcartefid: false
                },
                json: true
            }, (error, response) => {
                if (error) {
                    console.log('Erreur login mcommerce: ', error);
                    reject(error);
                } else if (response.body.error) {
                    console.log('Error: ', response.body.error);
                    reject(new Error(response.body.error));
                }
                resolve(response.body);
            });
        });
    }

    getRecette(product, token) {
        let url = "https://wsmcommerce.intermarche.com/api/v1/recherche/recette?mot=" + product;
        console.log("URRRRLL:" + url);
        var options = {
            method: 'GET',
            uri: url,

            headers: {
                'TokenAuthentification': token
            }
        };
        console.log("my Options:" + options);
        return new Promise((resolve, reject) => {
            request(options, (error, response) => {
                if (!error && response.statuscode == 200) {
                    resolve(response.body);
                }
                else {
                    reject(error);
                }
            });
        }
        );
    }

    getMcoUserInfo(token) {
        var options = {
            method: 'GET',
            uri: MCO_URL + "api/v1/clientRc",
            headers: {
                'TokenAuthentification': token
            },
            json: true
        };
        return new Promise((resolve, reject) => {
            request(options, (error, response) => {
                if (!error && response.statusCode == 200) {
                    resolve(response.body);
                } else {
                    console.log('Error while getting Mco user info: ' + error);
                    reject(error);
                }
            });
        })
    }

    getNamePdv(idPdv) {
        var options = {
            method: 'GET',
            uri: MCO_URL + "api/v1/pdv/fiche/" + idPdv,
            json: true
        };
        return new Promise((resolve, reject) => {
            request(options, (error, response) => {
                if (!error && response.statusCode == 200) {
                    resolve(response.body);
                } else {
                    console.log('Error while getting name PDV: ' + error);
                    reject(error);
                }
            });
        })
    }

    getCreneaux(tok) {
        var options = {
            method: 'GET',
            uri: MCO_URL + "api/v1/pdv/creneaux",
            headers: {
                'TokenAuthentification': tok
            },
            json: true
        };
        return new Promise((resolve, reject) => {
            request(options, (error, response) => {
                if (!error && response.statusCode == 200) {
                    console.log('reponse creneaux' + response.body);
                    resolve(response.body);
                } else {
                    console.log('Error while getting creneaux ' + error);
                    reject(error);
                }
            });
        })
    }

    emptyBasket(token) {
        let options = {
            method: "DELETE",
            uri: MCO_URL + "api/v1/client/panier",
            headers: {
                "TokenAuthentification": token
            },
            json: true
        }
        return new Promise((resolve, reject) => {
            request(options, (error, response) => {
                if (!error && response.statusCode == 200) {
                    console.log("à priori le panier devrait être vidé");
                    resolve(response.body);
                } else {
                    console.log("Il y a eu un problème lors du vidage du panier");
                    reject(error);
                }
            })
        })
    }
}

