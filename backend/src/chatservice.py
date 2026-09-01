from agent import generate_response
import os

class ChatService:
    def __init__(self, api_key):
        self.api_key = api_key

    def get_response(self, user_message):
        response = generate_response(user_message)
        return response
