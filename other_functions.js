
exports.parseCookies = function (cookiesString) {
    var list = {};
    cookiesString && cookiesString.split(';').forEach(function (c1) {
        c1 && c1.split(',').forEach(function (cookie) {
            var parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    });
    return list;
}

exports.getMonth = function (n) {
    var x = "";
    if (n === 1) {
        x = "Janvier";
    }
    else if (n === 2) {
        x === "F\u00E9vrier";
    }
    else if (n === 3) {
        x === "Mars";
    }
    else if (n === 4) {
        x === "Avril";
    }
    else if (n === 5) {
        x === "Mai";
    }
    else if (n === 6) {
        x === "Juin";
    }
    else if (n === 7) {
        x === "Juillet";
    }
    else if (n === 8) {
        x === "Ao\u00FBt";
    }
    else if (n === 9) {
        x === "Septembre";
    }
    else if (n === 10) {
        x === "Octobre";
    }
    else if (n === 11) {
        x === "Novembre";
    }
    else if (n === 12) {
        x === "D\u00E9cembre";
    }
    return x;
}


