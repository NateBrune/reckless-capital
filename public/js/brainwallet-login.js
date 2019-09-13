function loginElite(){
  var username = document.getElementById("username").value
  var password = document.getElementById("password").value
  var csrf = document.getElementById("_csrf").value
  const publicKey = derivePubKey(username, password, 0)
  const privateKey = derivePrivateKey(username, password, 0)
  localStorage.setItem('privateKey', privateKey);
  localStorage.setItem('publicKey', publicKey)
  const challenge = httpGet("challenge/" + publicKey)
  const signature = signString(privateKey, challenge)
  result = httpPost("verify", {publicKey: publicKey, signature: signature, _csrf: csrf})
  window.location = "/"
}

/* Utility */
function httpGet(theUrl)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, false ); // false for synchronous request
    xmlHttp.send( null );
    return xmlHttp.responseText;
}


function httpPost(path, params) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", path, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  
  xhr.onreadystatechange = function() { 
    if (xhr.readyState == 4)
      if (xhr.status == 200)
        var json_data = xhr.responseText; 
        //console.log(json_data)
        //document.write(json_data)
  };
  xhr.send(JSON.stringify(params));
}