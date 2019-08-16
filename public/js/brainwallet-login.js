function loginElite(){
  var username = document.getElementById("username").value
  var password = document.getElementById("password").value
  var csrf = document.getElementById("_csrf").value
  const credentials = derivePubKey(username, password, 0)
  const wif = derivePrivateKey(username, password, 0)
  const challenge = httpGet("challenge/" + credentials)
  console.log("challenge string: " + challenge)
  //alert("got challenge: " + challenge)
  const signature = signString(wif, challenge)
  result = httpPost("verify", {address: credentials, signature: signature, _csrf: csrf})
  window.location = "/"
  //console.log(result)
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
    // If the request completed, close the extension popup
    if (xhr.readyState == 4)
      if (xhr.status == 200)
        var json_data = xhr.responseText; 
        //console.log(json_data)
        //document.write(json_data)
  };
  xhr.send(JSON.stringify(params));
}