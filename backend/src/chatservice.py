from agent import generate_response, generate_evaluation_response
import os

class ChatService:
    def __init__(self, api_key):
        self.api_key = api_key
    def get_evaluation_response(self, user_message):
        response = generate_evaluation_response(user_message)
        return response

    def get_response(self, user_message):
        response = generate_response(user_message)
        return response

