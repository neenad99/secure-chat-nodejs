var SecureChat = SecureChat || {};

SecureChat.Panel = (function () {

  var PanelStates = {
    NOT_LOGGED : 0,
    LOGGED     : 1
  };

  var panelState = null;

  var isShowingMessages = false;
  var messagesTimeoutId;
  var loadedMessages = [];

  function init() {

    $("#registerForm").on("submit", function() {
      var $username = $("#registerFormUsername");
      var $password = $("#registerFormPassword");
      var $passwordReenter = $("#registerFormPasswordReenter");
      var $alert = $("#registerForm .alert");
      hideAlert($alert);
      if (!$username.val() || !$password.val() || !$passwordReenter.val()) {
        showAlert($alert, "warning", "All fields are required");
        return false;
      }
      if ($password.val() !== $passwordReenter.val()) {
        showAlert($alert, "warning", "Passwords should be equal");
        return false;
      }

      showSpinner($(this));
      SecureChat.Auth.doRegister($username.val(), $password.val(), function(data) {
        hideSpinner();
        if(data && data.success) {
          showAlert($alert, "success", "User successfully created");
          setTimeout(function() {
            redrawPanel();
          }, 1000);
          $username.val("");
          $password.val("");
          $passwordReenter.val("");
          panelState = PanelStates.LOGGED;
        } else {
          showAlert($alert, "warning", data ? data.message : "Unable to connect to server");
        }
      });
      return false;
    });

    $("#loginForm").on("submit", function() {
      var $username = $("#username");
      var $password = $("#password");
      var $alert = $("#loginForm .alert");
      hideAlert($alert);
      if (!$username.val() || !$password.val()) {
        showAlert($alert, "warning", "All fields are required");
        return false;
      }
      showSpinner($(this));
      SecureChat.Auth.doAuthenticate($username.val(), $password.val(), function(data) {
        hideSpinner();  
        if(data && data.success) {
          showAlert($alert, "success", "User successfully authenticated");
          setTimeout(function() {
            redrawPanel();
          }, 1000);
          $username.val("");
          $password.val("");
          panelState = PanelStates.LOGGED;
        } else {
          showAlert($alert, "warning", data ? data.message : "Unable to connect to server");
        }
      });
      return false;
    });

    $("#addContactForm").on("submit", function() {
      var $contact = $("#addUsername");
      var $alert = $("#contacts .alert");
      hideAlert($alert);
      if (!$contact.val()) {
        showAlert($alert, "warning", "Enter contact to add");
        return false;
      }
      showSpinner($(this));
      SecureChat.API.addContact($contact.val(), function(data) {
        hideSpinner();
        if(data.success) {
          $contact.val("");
          loadAndShowContacts();
        } else {
          showAlert($alert, "warning", data.message);
        }
      });
      return false;
    });

    $("#addMessageForm").on("submit", function() {
      var $receiver = $("#receiver");
      var $message = $("#addMessage");
      var $isEncrypted = $("#isEncrypted");
      var $alert = $("#messages .alert");
      hideAlert($alert);

      if (!$receiver.val()) {
        showAlert($alert, "warning", "Please choose your friend in contact list!");
        return false;
      }

      if (!$message.val()) {
        return false;
      }

      var message = $message.val();
      var key = "";
      var keyEncryptedBySender = "";
      if ($isEncrypted.is(":checked")) {
        var encryptedMessageAndKey = SecureChat.AES.encrypt(message);
        message = encryptedMessageAndKey[0];
        key = SecureChat.RSA.encrypt(encryptedMessageAndKey[1], $receiver.val());
        keyEncryptedBySender = SecureChat.RSA.encrypt(encryptedMessageAndKey[1]);
      }

      showSpinner($(".spinner-holder"));
      SecureChat.API.addMessage($receiver.val(), message, key, keyEncryptedBySender, $isEncrypted.is(":checked"), function(data) {
        hideSpinner();
        if(data.success) {
          $message.val("");
          showMessages(data.messages);
        } else {
          showAlert($alert, "warning", data.message);
        }
      });
      return false;
    });
    
    $("#ownKeysForm").on("submit", function() {
      var $alert = $(".own-keys .alert");
      if (!SecureChat.RSA.checkOwnKeys($("#ownPrivateKey").val(), $("#ownPublicKey").val())) {
        showAlert($alert, "warning", "Something wrong with your keys. Regenerate it, please");
        return false;
      }
      SecureChat.RSA.saveOwnPublicKey($("#ownPublicKey").val());
      SecureChat.RSA.saveOwnPrivateKey($("#ownPrivateKey").val());
      showAlert($alert, "success", "Successfully saved");
      return false;
    });

    $("#publicKeyForm").on("submit", function() {
      var $alert = $(".public-key .alert");
      var receiver = $("#receiver").val();
      if (receiver) {
        SecureChat.RSA.saveContactPublicKey(receiver, $("#publicKey").val());
        showAlert($alert, "success", "Successfully saved");
      }
      return false;
    });

    $("a[data-toggle='tab']").on("shown.bs.tab", function (e) {
      isShowingMessages = false;
      if (messagesTimeoutId) {
        clearTimeout(messagesTimeoutId);
        messagesTimeoutId = null;
      }
      if ("#profile" === $(e.target).attr("href")) {
        $("#ownPrivateKey").val(SecureChat.RSA.getOwnPrivateKey());
        $("#ownPublicKey").val(SecureChat.RSA.getOwnPublicKey());
      }
      if ("#contacts" === $(e.target).attr("href")) {
        $("#addUsername").val("");
        loadAndShowContacts();
      }
      if ("#messages" === $(e.target).attr("href")) {
        $("#messageList li").remove();
        isShowingMessages = true;
        loadedMessages = [];
        loadAndShowMessages();
        showPublicKey();
      }
    });

    $("a.login-link").on("click", function () {
      if (panelState == PanelStates.LOGGED) {
        SecureChat.Auth.doLogout();
        panelState = PanelStates.NOT_LOGGED;
      } else {
        showLoginTab();
      }
      redrawPanel();
    });

    $(document.body).on("click", "#contactList li", function() {
      var username = $(this).data("username");
      $("#receiver").val(username);
      $("span#receiverName").text("with " + username);
      showMessagesTab();
    });

    $(document.body).on("click", ".delete-contact", function() {
      var $alert = $("#contacts .alert");
      var username = $(this).closest(".list-group-item").data("username");
      SecureChat.API.deleteContact(username, function(data) {
        if(data && data.success) {
          loadAndShowContacts();
        } else {
          showAlert($alert, "warning", data ? data.message : "Server error");
        }
      });
      return false;
    });

    $(document.body).on("click", ".approve-request", function() {
      var $alert = $("#contacts .alert");
      var username = $(this).closest(".list-group-item").data("username");
      SecureChat.API.approveRequest(username, function(data) {
        if(data && data.success) {
          loadAndShowContacts();
        } else {
          showAlert($alert, "warning", data ? data.message : "Server error");
        }
      });
      return false;
    });

    $(document.body).on("click", ".delete-request", function() {
      var $alert = $("#contacts .alert");
      var username = $(this).closest(".list-group-item").data("username");
      SecureChat.API.deleteRequest(username, function(data) {
        if(data && data.success) {
          loadAndShowContacts();
        } else {
          showAlert($alert, "warning", data ? data.message : "Server error");
        }
      });
      return false;
    });

    $("#addMessage").keypress(function(event) {
      if (event.which == 13) {
        event.preventDefault();
        $("#addMessageForm").submit();
      }
    });

    $(document.body).on("click", "input#isEncrypted", function() {
      if (!$(this).is(":checked")) {
        return;
      }

      var $alert = $("#messages .alert:eq(1)");
      var $receiver = $("#receiver");
      hideAlert($alert);

      if (!SecureChat.RSA.checkOwnKeys()) {
        showAlert($alert, "warning", "Please check your RSA keys!");
        $(this).prop('checked', false);
        return;
      }

      if (!SecureChat.RSA.getContactPublicKey($receiver.val())) {
        showAlert($alert, "warning", "Please check if RSA key of your friend is filled!");
        $(this).prop('checked', false);
      }
    });

    panelState = SecureChat.Auth.isLogged() ? PanelStates.LOGGED : PanelStates.NOT_LOGGED;
    redrawPanel();

  }

  function redrawPanel() {
    if (panelState == PanelStates.LOGGED) {
      //show username
      var currentUser = SecureChat.Auth.getCurrentUser();
      $("strong.user-name").text(currentUser.username);
      $("a.login-link").text("logout");
      $("#currentUser").show().find("strong").text(currentUser.username);
      $("#loginRegisterForms").hide();

      // Clean fields on "Messages" tab
      $("#receiver").val("");
      $("span#receiverName").text("");
      $("#messageList li").remove();
      $("#addMessage").val("");

      //show tabs
      $("a[href='#contacts']").parent().show();
      $("a[href='#messages']").parent().show();

      showContactsTab();
    } else {
      $("strong.user-name").text("");
      $("a.login-link").text("login");
      $("#currentUser").hide();
      $("#loginRegisterForms").show();

      //hide tabs
      $("a[href='#contacts']").parent().hide();
      $("a[href='#messages']").parent().hide();

      showLoginTab();
    }
  }

  function showLoginTab() {
    $("#mainTabs a[href='#profile']").tab("show");
    $("#loginForm").removeClass("hidden");
    $("#registerForm").removeClass("hidden");
  }

  function showContactsTab() {
    $("#mainTabs a[href='#contacts']").tab("show");
  }

  function showMessagesTab() {
    $("#mainTabs a[href='#messages']").tab("show");
  }

  function loadAndShowContacts() {
    SecureChat.API.getContacts(function(data) {
      if (data === null || !data.success) {
        doLogout();
        return;
      }
      showContactsAndRequests($("#contactList"), data.contacts);
      showContactsAndRequests($("#requestList"), data.requests);
    });
  }

  function showPublicKey() {
    var receiver = $("#receiver").val();
    if (!receiver) {
      return;
    }
    $("#publicKey").val(SecureChat.RSA.getContactPublicKey(receiver));
  }

  function getNewestMessageDate () {
    var newestMessageDate = null;
    loadedMessages.map(function(message) {
      var creationDate = new Date(message.dateCreated);
      if (creationDate > newestMessageDate) {
        newestMessageDate = creationDate;
      }
    });
    return newestMessageDate;
  }

  function loadAndShowMessages() {
    var receiver = $("#receiver").val();
    if (!receiver) {
      return;
    }
    showSpinner($(".spinner-holder"));
    SecureChat.API.getMessages(receiver, getNewestMessageDate(), function(data) {
      hideSpinner();
      if (data === null || !data.success) {
        doLogout();
        return;
      }
      showMessages(data.messages);
      if (isShowingMessages) {
        messagesTimeoutId = setTimeout(loadAndShowMessages, 2000);
      }
    });
  }

  function showContactsAndRequests(target, contacts) {
    target.find("li:visible").remove();
    contacts.forEach(function(contact) {
      var element = target.find("li:eq(0)").clone();
      element
        .css({"display": ""})
        .attr("data-username", contact.username)
        .find(".list-group-item-text").text(contact.username);
      element.appendTo(target);
    });
  }

  function showMessages(messages) {
    var receiver = $("#receiver").val();
    var newestMessageDate = getNewestMessageDate();
    messages.forEach(function(message) {
      var dateCreated = new Date(message.dateCreated);
      var style = "";
      var messageText = "";
      var key = "";

      if (dateCreated <= newestMessageDate) {
        return true;
      }

      if (message.isOwn) {
        style = "background-color:#adadad;"
      }

      if(message.isEncrypted) {
        if (message.isOwn) {
          key = SecureChat.RSA.decrypt(message.keyEncryptedBySender);
          if (key) messageText = SecureChat.AES.decrypt(message.messageText, key);
          style = "background-color:#3399ff;"
        } else {
          key = SecureChat.RSA.decrypt(message.key);
          if (key) messageText = SecureChat.AES.decrypt(message.messageText, key);
          style = "background-color:#e6f2ff;"
        }
        if (!messageText) {
          messageText = "DECODING FAILED";
        }
      } else {
        messageText = message.messageText;
      }
      $("#messageList").prepend($("<li class='list-group-item' style='" + style + "'></li>").text(messageText));
      loadedMessages.push(message);
    });
  }

  function doLogout() {
    panelState = PanelStates.NOT_LOGGED;
    SecureChat.Auth.doLogout();
    showLoginTab();
    redrawPanel();
  }

  /**
   * shows message when user
   * @target: HTMLDivElement  // dom element hosting the message
   * @type: string            // part of the class, now either 'warning' or 'success'
   * @message: string         // message to be displayed
   */
  function showAlert (target, type, message) {
    target
      .attr("class", "alert fade in alert-" + type)
      .find("span.alert-text")
      .text(message)
      ;
    setTimeout(function() {
      hideAlert(target);
    }, 2000);
  }

  /**
   * hide alert and clean the message
   * @target: HTMLDivElement  // dom element hosting the message
   */
  function hideAlert (target) {
    target
      .attr("class", "alert fade in hidden")
      .find("span.alert-text")
      .text("")
      ;
  }

  function showSpinner(target) {
    target.prepend($("<div class='spinner'></div>"));
  }

  function hideSpinner() {
    $(".spinner").remove();
  }

  return {
    init: init
  };
})();